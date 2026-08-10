import { apiError } from "@/lib/server/api-response";

const XLSX_SIGNATURE = [0x50, 0x4b, 0x03, 0x04];
const DEFAULT_SPREADSHEET_MAX_SIZE = 50 * 1024 * 1024;

function hasSignature(bytes: Uint8Array, signature: number[]) {
  return signature.every((value, index) => bytes[index] === value);
}

export async function validateSpreadsheetFile(
  file: File,
  { maxSizeBytes = DEFAULT_SPREADSHEET_MAX_SIZE }: { maxSizeBytes?: number } = {},
) {
  const lowerName = file.name.toLowerCase();
  if (!/\.(xlsx|xlsm)$/.test(lowerName)) {
    return { ok: false as const, response: apiError("Envie uma planilha .xlsx ou .xlsm válida.", 400) };
  }
  if (file.size <= 0) {
    return { ok: false as const, response: apiError("A planilha enviada está vazia.", 400) };
  }
  if (file.size > maxSizeBytes) {
    return { ok: false as const, response: apiError("Planilha maior que 50 MB.", 413) };
  }

  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer.slice(0, XLSX_SIGNATURE.length));
  if (!hasSignature(bytes, XLSX_SIGNATURE)) {
    return { ok: false as const, response: apiError("Formato de planilha inválido. Salve o arquivo como .xlsx e tente novamente.", 400) };
  }

  return { ok: true as const, buffer };
}
