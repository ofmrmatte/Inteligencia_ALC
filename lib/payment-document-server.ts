import { extractArchiveFiles, safeStorageName, sha256Bytes } from "@/lib/driver-portal";
import { normalizeText } from "@/lib/normalize";
import { createAdminClient } from "@/lib/supabase/admin";

type DbRow = Record<string, unknown>;
type AdminClient = ReturnType<typeof createAdminClient>;

function text(value: unknown) {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function basename(path: string) {
  return path.replace(/\\/g, "/").split("/").filter(Boolean).at(-1) ?? path;
}

export function paymentNameKey(value: unknown) {
  return normalizeText(value).replace(/[^A-Z0-9]+/g, "");
}

export function paymentDriverNameFromTitle(title: string) {
  return title
    .replace(/\.pdf$/i, "")
    .replace(/[_\s-]+\d{2}[-_]\d{2}[-_](?:\d{2}|20\d{2})$/i, "")
    .replace(/_/g, " ")
    .trim();
}

export function paymentDriverNameKeyFromTitle(title: string) {
  return paymentNameKey(paymentDriverNameFromTitle(title));
}

export interface PaymentBaseRef {
  baseKey: string;
  baseName?: string;
  sigla?: string;
}

export interface PaymentDriverRef {
  id: string;
  driverCode: string;
  fullName: string;
  baseKey: string;
  sigla?: string;
}

function baseContext(baseKey: string, bases: PaymentBaseRef[]) {
  const normalized = normalizeText(baseKey);
  const exact = bases.find((base) => normalizeText(base.baseKey) === normalized);
  return {
    baseKey: exact?.baseKey || baseKey,
    sigla: exact?.sigla || "",
  };
}

export function paymentDriverMatchesBase(
  documentBaseKey: string,
  driver: Pick<PaymentDriverRef, "baseKey" | "sigla">,
  bases: PaymentBaseRef[],
  allowUnscoped = false,
) {
  const document = baseContext(documentBaseKey, bases);
  const docBase = normalizeText(document.baseKey);
  const docSigla = normalizeText(document.sigla);
  const driverBase = normalizeText(driver.baseKey);
  const driverSigla = normalizeText(driver.sigla);

  if (!driverBase && !driverSigla) return allowUnscoped;
  if (driverBase && driverBase === docBase) return true;
  if (docSigla && driverSigla === docSigla) return true;
  if (docSigla && driverBase === docSigla) return true;
  return false;
}

export function paymentDriverCandidates(
  documentBaseKey: string,
  drivers: PaymentDriverRef[],
  bases: PaymentBaseRef[],
  options: { allowUnscoped?: boolean; expectedNameKey?: string } = {},
) {
  const expected = options.expectedNameKey || "";
  return drivers.filter((driver) => {
    if (!/^\d+$/.test(driver.driverCode.trim())) return false;
    const compatible = paymentDriverMatchesBase(documentBaseKey, driver, bases, Boolean(options.allowUnscoped));
    if (!compatible) return false;
    if (!driver.baseKey && !driver.sigla && expected) {
      return paymentNameKey(driver.fullName) === expected;
    }
    return true;
  });
}

export async function ensurePaymentDocumentDraftVersion(
  admin: AdminClient,
  document: DbRow,
  actorProfileId: string,
) {
  const versions = Array.isArray(document.driver_payment_document_versions)
    ? document.driver_payment_document_versions as DbRow[]
    : [];
  if (versions.length) return versions[0];

  const batchId = text(document.batch_id);
  const documentId = text(document.id);
  const title = text(document.title);
  if (!batchId || !documentId || !title) throw new Error("Documento sem referência suficiente para recuperar o PDF.");

  const { data: batch, error: batchError } = await admin
    .from("driver_payment_batches")
    .select("original_name,storage_path,metadata")
    .eq("id", batchId)
    .single();
  if (batchError) throw new Error(batchError.message);

  const archivePath = text(batch.storage_path);
  if (!archivePath) throw new Error("Arquivo compactado original não encontrado.");
  const download = await admin.storage.from("driver-payments").download(archivePath);
  if (download.error) throw new Error(download.error.message);

  const archiveBytes = new Uint8Array(await download.data.arrayBuffer());
  const extracted = await extractArchiveFiles(text(batch.original_name), archiveBytes);
  const metadata = (batch.metadata ?? {}) as DbRow;
  const files = Array.isArray(metadata.files) ? metadata.files as DbRow[] : [];
  const metadataMatch = files.find((item) => text(item.originalName) === title);
  const wantedPath = text(metadataMatch?.path);
  const candidates = extracted.filter((item) => wantedPath ? item.path === wantedPath : basename(item.path) === title);
  if (candidates.length !== 1) throw new Error("Não foi possível localizar com segurança o PDF dentro do lote original.");

  const file = candidates[0];
  const storagePath = `payment-documents/${batchId}/${documentId}-${safeStorageName(title)}`;
  const upload = await admin.storage
    .from("driver-payments")
    .upload(storagePath, file.bytes, { contentType: "application/pdf", upsert: false });
  if (upload.error && !upload.error.message.toLowerCase().includes("already exists")) {
    throw new Error(upload.error.message);
  }

  const fileHash = await sha256Bytes(file.bytes);
  const { data: existing } = await admin
    .from("driver_payment_document_versions")
    .select("*")
    .eq("document_id", documentId)
    .eq("version_number", 1)
    .maybeSingle();
  if (existing) return existing;

  const versionInsert = await admin.from("driver_payment_document_versions").insert({
    document_id: documentId,
    version_number: 1,
    storage_path: storagePath,
    file_hash: fileHash,
    file_size: file.size,
    original_name: title,
    published_by: actorProfileId,
    status: "draft",
    notes: "PDF recuperado do lote para conferência/identificação.",
  }).select().single();
  if (versionInsert.error) throw new Error(versionInsert.error.message);
  return versionInsert.data;
}
