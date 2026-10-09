import { createHash, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { PoolClient } from "pg";
import type { AuthProfile } from "@alc/identity/auth";
import { db, audit } from "./db";
import { authConfig, HttpError, scopeFor } from "./auth";
import { requireOperator } from "./operator-directory";
import { canReadConversation } from "./inbox";
import { channelConfig, graph, type Channel } from "./meta";
import {
  boundedBytes,
  MAX_MEDIA_BYTES,
  mediaFilename,
  receivedFilename,
  safeMetaMediaUrl,
  scanMedia,
  validateMedia,
} from "./media-validation";

type Media = {
  id: string;
  conversation_id: string;
  message_id: string | null;
  case_id: string | null;
  channel: Channel;
  origin: string;
  filename: string;
  mime: string;
  type: string;
  size: number;
  sha256: string;
  object_key: string;
  provider_media_id: string | null;
  status: string;
  uploaded_by: string | null;
  retention_until: Date | string;
  legal_hold: boolean;
};
type MediaConversation = {
  id: string;
  phone: string;
  channel: Channel;
  status: string;
  assigned_to: string | null;
  last_inbound_at: string;
  base_key: string;
  sigla: string;
  case_id: string;
};
const uuid = z.string().uuid();
const uploadSchema = z
  .object({
    id: uuid,
    conversationId: uuid,
    filename: z.string(),
    mime: z.string().max(150),
  })
  .strict();
function retentionUntil() {
  const days = z.coerce
    .number()
    .int()
    .min(1)
    .max(3650)
    .parse(process.env.ATENDIMENTO_MEDIA_RETENTION_DAYS || 180);
  return new Date(Date.now() + days * 86_400_000);
}
async function storage() {
  const bucket = process.env.ATENDIMENTO_MEDIA_BUCKET,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!bucket || !key)
    throw new HttpError(503, "Acervo privado de anexos não configurado.");
  const client = createClient(authConfig().url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          signal: init?.signal
            ? AbortSignal.any([init.signal, AbortSignal.timeout(30_000)])
            : AbortSignal.timeout(30_000),
        }),
    },
  });
  const { data, error } = await client.storage.getBucket(bucket);
  if (error || !data || data.public)
    throw new HttpError(503, "Acervo de anexos deve ser privado.");
  return client.storage.from(bucket);
}
function publicMedia(row: Media) {
  return {
    id: row.id,
    filename: row.filename,
    mime: row.mime,
    type: row.type,
    size: row.size,
    status: row.status,
  };
}
async function canReadMedia(
  profile: AuthProfile,
  row: Media,
  conversation: MediaConversation,
) {
  if (!(await canReadConversation(profile, conversation))) return false;
  if (!row.case_id) return true;
  const pnr = (
    await db().query(
      "SELECT base_key,sigla,case_id FROM alc_atendimento.cases WHERE case_id=$1",
      [row.case_id],
    )
  ).rows[0];
  return Boolean(pnr && (await canReadConversation(profile, pnr)));
}
export async function assertMediaReply(
  profile: AuthProfile,
  row: MediaConversation,
  connection: PoolClient,
) {
  await requireOperator(profile, connection);
  if (
    !(await canReadConversation(
      profile,
      row,
      await scopeFor(profile, connection),
      connection,
    ))
  )
    throw new HttpError(404, "Atendimento não encontrado.");
  if (row.assigned_to !== profile.id || row.status !== "human")
    throw new HttpError(409, "Assuma o atendimento antes de anexar arquivos.");
  if (
    !row.last_inbound_at ||
    Date.now() - new Date(String(row.last_inbound_at)).getTime() > 86_400_000
  )
    throw new HttpError(
      409,
      "Janela de atendimento encerrada. Use um modelo aprovado.",
    );
}
export async function reserveUpload(profile: AuthProfile, input: unknown) {
  const parsed = uploadSchema.parse(input),
    filename = mediaFilename(parsed.filename);
  const connection = await db().connect();
  try {
    await connection.query("BEGIN");
    await connection.query(
      "SELECT pg_advisory_xact_lock(hashtext('atendimento_operator_directory'))",
    );
    await connection.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
      [parsed.conversationId],
    );
    const row = (
      await connection.query(
        "SELECT * FROM alc_atendimento.conversations WHERE id=$1 FOR UPDATE",
        [parsed.conversationId],
      )
    ).rows[0];
    if (!row) throw new HttpError(404, "Atendimento não encontrado.");
    await assertMediaReply(profile, row, connection);
    const quota = (
      await connection.query(
        `SELECT count(*)::int AS hourly,
      count(*) FILTER(WHERE status='pending')::int AS pending FROM alc_atendimento.media
      WHERE uploaded_by=$1 AND created_at>now()-interval '1 hour'`,
        [profile.id],
      )
    ).rows[0];
    if (quota.hourly >= 100 || quota.pending >= 2)
      throw new HttpError(
        429,
        "Limite de anexos atingido. Aguarde o processamento.",
      );
    const concurrent = (
      await connection.query(
        "SELECT count(*)::int AS count FROM alc_atendimento.media WHERE status='pending'",
      )
    ).rows[0].count;
    if (concurrent >= 4)
      throw new HttpError(
        429,
        "Uploads em processamento. Tente novamente em instantes.",
      );
    const inserted = await connection.query(
      `INSERT INTO alc_atendimento.media
      (id,conversation_id,case_id,channel,origin,filename,uploaded_by,object_key,retention_until)
      VALUES($1,$2,$3,$4,'outbound',$5,$6,$7,$8) ON CONFLICT(id) DO NOTHING RETURNING *`,
      [
        parsed.id,
        row.id,
        row.case_id,
        row.channel,
        filename,
        profile.id,
        `media/${parsed.id}`,
        retentionUntil(),
      ],
    );
    if (!inserted.rowCount)
      throw new HttpError(
        409,
        "Upload já registrado. Consulte seu status antes de tentar novamente.",
      );
    await audit(
      profile.id,
      "media_upload_reserved",
      parsed.id,
      { conversationId: row.id },
      connection,
    );
    await connection.query("COMMIT");
    return inserted.rows[0] as Media;
  } catch (error) {
    await connection.query("ROLLBACK");
    throw error;
  } finally {
    connection.release();
  }
}
async function updateScan(row: Media, bytes: Buffer) {
  if (createHash("sha256").update(bytes).digest("hex") !== row.sha256)
    throw new HttpError(409, "Integridade do anexo não confirmada.");
  const scan = await scanMedia(bytes),
    status =
      scan === "clean"
        ? "ready"
        : scan === "infected"
          ? "rejected"
          : "quarantined";
  const result = await db().query(
    `UPDATE alc_atendimento.media SET status=$2,error=$3,updated_at=now()
    WHERE id=$1 AND status IN ('pending','quarantined') RETURNING *`,
    [
      row.id,
      status,
      scan === "clean"
        ? null
        : scan === "infected"
          ? "Arquivo rejeitado pela verificação de segurança."
          : "Aguardando verificação de segurança.",
    ],
  );
  await audit(null, "media_scan", row.id, { status, sha256: row.sha256 });
  return publicMedia((result.rows[0] || row) as Media);
}
export async function finishUpload(
  row: Media,
  bytes: Buffer,
  declaredMime: string,
) {
  try {
    const verified = await validateMedia(bytes, row.filename, declaredMime);
    if (row.sha256 && row.sha256 !== verified.sha256)
      throw new HttpError(415, "O conteúdo original do anexo foi alterado.");
    await db().query(
      "UPDATE alc_atendimento.media SET mime=$2,type=$3,size=$4,sha256=$5,updated_at=now() WHERE id=$1 AND status='pending'",
      [row.id, verified.mime, verified.type, verified.size, verified.sha256],
    );
    Object.assign(row, verified);
    const bucket = await storage();
    const { error } = await bucket.upload(row.object_key, bytes, {
      contentType: row.mime,
      upsert: false,
    });
    if (error) {
      // An interrupted object upload may have succeeded; reuse only exact original bytes, never overwrite.
      try {
        await privateBytes(row);
      } catch {
        throw new HttpError(
          503,
          "Arquivo não arquivado. Nenhuma mensagem foi enviada.",
        );
      }
    }
    return await updateScan(row, bytes);
  } catch (error) {
    await failMedia(row.id, error);
    throw error;
  }
}
export async function failMedia(id: string, error: unknown) {
  const rejected =
    error instanceof HttpError && [400, 413, 415].includes(error.status);
  await db().query(
    "UPDATE alc_atendimento.media SET status=$2,error=$3,updated_at=now() WHERE id=$1 AND status IN ('pending','quarantined')",
    [
      id,
      rejected ? "rejected" : "failed",
      rejected ? error.message : "Não foi possível arquivar este anexo.",
    ],
  );
}
async function privateBytes(row: Media) {
  const { data, error } = await (await storage()).download(row.object_key);
  if (error || !data)
    throw new HttpError(503, "Arquivo arquivado temporariamente indisponível.");
  const bytes = await boundedBytes(data.stream(), MAX_MEDIA_BYTES);
  if (
    bytes.length !== row.size ||
    createHash("sha256").update(bytes).digest("hex") !== row.sha256
  )
    throw new HttpError(409, "Integridade do anexo não confirmada.");
  return bytes;
}
export async function mediaAccess(
  profile: AuthProfile,
  mediaId: string,
  statusOnly = false,
) {
  const row = (
    await db().query("SELECT * FROM alc_atendimento.media WHERE id=$1", [
      uuid.parse(mediaId),
    ])
  ).rows[0] as Media | undefined;
  const conversation = row
    ? (
        await db().query(
          "SELECT * FROM alc_atendimento.conversations WHERE id=$1",
          [row.conversation_id],
        )
      ).rows[0]
    : null;
  if (
    !row ||
    !conversation ||
    !(await canReadMedia(profile, row, conversation))
  )
    throw new HttpError(404, "Anexo não encontrado.");
  if (statusOnly) return { metadata: publicMedia(row), bytes: null };
  if (
    row.status !== "ready" ||
    (!row.legal_hold && new Date(row.retention_until).getTime() <= Date.now())
  )
    throw new HttpError(
      409,
      "Anexo indisponível, em quarentena ou fora da retenção.",
    );
  const bytes = await privateBytes(row);
  // Authorization is checked again after the object-store read, before any bytes leave the server.
  const fresh = (
    await db().query(
      "SELECT * FROM alc_atendimento.conversations WHERE id=$1",
      [row.conversation_id],
    )
  ).rows[0];
  if (!fresh || !(await canReadMedia(profile, row, fresh)))
    throw new HttpError(404, "Anexo não encontrado.");
  const current = (
    await db().query(
      "SELECT status,legal_hold,retention_until FROM alc_atendimento.media WHERE id=$1",
      [row.id],
    )
  ).rows[0];
  if (
    !current ||
    current.status !== "ready" ||
    (!current.legal_hold &&
      new Date(current.retention_until).getTime() <= Date.now())
  )
    throw new HttpError(409, "Anexo indisponível.");
  await audit(profile.id, "media_access", row.id, {
    sha256: row.sha256,
    conversationId: row.conversation_id,
  });
  return { metadata: publicMedia(row), bytes };
}
export async function verifyMedia(profile: AuthProfile, mediaId: string) {
  await mediaAccess(profile, mediaId, true);
  const row = (
    await db().query(
      `UPDATE alc_atendimento.media SET updated_at=now(),attempts=attempts+1
    WHERE id=$1 AND status='quarantined' AND retention_until>now() AND updated_at<now()-interval '30 seconds' RETURNING *`,
      [mediaId],
    )
  ).rows[0] as Media | undefined;
  if (!row)
    throw new HttpError(
      409,
      "Aguarde a verificação ou consulte o status do anexo.",
    );
  return updateScan(row, await privateBytes(row));
}
export async function purgeExpiredMedia(apply: boolean) {
  const connection = await db().connect();
  try {
    await connection.query("BEGIN");
    const expired = (
      await connection.query(`SELECT * FROM alc_atendimento.media a WHERE NOT a.legal_hold AND a.retention_until<now() AND a.status<>'deleted'
      AND NOT EXISTS(SELECT 1 FROM alc_atendimento.outbox o WHERE o.media_id=a.id AND o.status IN ('pending','sending','uncertain'))
      ORDER BY a.retention_until LIMIT 100 FOR UPDATE OF a SKIP LOCKED`)
    ).rows as Media[];
    if (apply && expired.length) {
      const { error } = await (
        await storage()
      ).remove(expired.map((row) => row.object_key));
      if (error)
        throw new HttpError(503, "Acervo indisponível. Retenção não aplicada.");
      for (const row of expired) {
        await connection.query(
          "UPDATE alc_atendimento.media SET status='deleted',updated_at=now() WHERE id=$1",
          [row.id],
        );
        await audit(
          null,
          "media_retention_applied",
          row.id,
          { sha256: row.sha256 },
          connection,
        );
      }
    }
    await connection.query("COMMIT");
    return {
      candidates: expired.length,
      deleted: apply ? expired.length : 0,
      limit: 100,
    };
  } catch (error) {
    await connection.query("ROLLBACK");
    throw error;
  } finally {
    connection.release();
  }
}
export async function queueMedia(
  profile: AuthProfile,
  conversation: MediaConversation,
  mediaId: string,
  caption: string,
  retry: boolean,
  connection: PoolClient,
) {
  await assertMediaReply(profile, conversation, connection);
  const row = (
    await connection.query(
      "SELECT * FROM alc_atendimento.media WHERE id=$1 FOR UPDATE",
      [uuid.parse(mediaId)],
    )
  ).rows[0] as Media | undefined;
  if (
    !row ||
    row.origin !== "outbound" ||
    row.uploaded_by !== profile.id ||
    row.conversation_id !== conversation.id ||
    row.channel !== conversation.channel ||
    row.case_id !== (conversation.case_id || null)
  )
    throw new HttpError(404, "Anexo não encontrado.");
  if (
    row.status !== "ready" ||
    new Date(row.retention_until).getTime() <= Date.now()
  )
    throw new HttpError(
      409,
      "Anexo não liberado pela verificação de segurança.",
    );
  if (
    caption.length > 1024 ||
    (caption && ["audio", "sticker"].includes(row.type))
  )
    throw new HttpError(400, "Legenda incompatível com este anexo.");
  const key = `staff-media:${row.id}`,
    payload = {
      messaging_product: "whatsapp",
      to: conversation.phone,
      type: row.type,
      media_id: row.id,
      caption,
    };
  const existing = (
    await connection.query(
      "SELECT * FROM alc_atendimento.outbox WHERE dedupe_key=$1 FOR UPDATE",
      [key],
    )
  ).rows[0];
  if (existing) {
    if (
      existing.sender_user_id !== profile.id ||
      existing.payload.to !== payload.to ||
      existing.payload.caption !== caption ||
      existing.payload.media_id !== row.id
    )
      throw new HttpError(409, "Anexo já vinculado a outro envio.");
    if (retry && existing.status === "failed")
      await connection.query(
        "UPDATE alc_atendimento.outbox SET status='pending',error=NULL,updated_at=now() WHERE id=$1",
        [existing.id],
      );
    else if (retry || ["uncertain", "cancelled"].includes(existing.status))
      throw new HttpError(
        409,
        "Envio exige conferência manual; não será reenviado automaticamente.",
      );
  } else {
    await connection.query(
      `INSERT INTO alc_atendimento.outbox(dedupe_key,conversation_id,channel,phone,payload,sender_kind,sender_user_id,sender_display_name_snapshot,media_id,case_id)
      VALUES($1,$2,$3,$4,$5,'human',$6,$7,$8,$9)`,
      [
        key,
        conversation.id,
        conversation.channel,
        conversation.phone,
        payload,
        profile.id,
        profile.fullName || profile.email,
        row.id,
        row.case_id,
      ],
    );
  }
  await audit(
    profile.id,
    retry ? "media_retry_requested" : "media_queued",
    row.id,
    { conversationId: conversation.id, sha256: row.sha256 },
    connection,
  );
}
export async function outboundMedia(mediaId: string, connection: PoolClient) {
  const row = (
    await connection.query("SELECT * FROM alc_atendimento.media WHERE id=$1", [
      mediaId,
    ])
  ).rows[0] as Media | undefined;
  if (
    !row ||
    row.status !== "ready" ||
    new Date(row.retention_until).getTime() <= Date.now()
  )
    throw new HttpError(409, "Anexo não está disponível para envio.");
  return { row, bytes: await privateBytes(row) };
}
export async function archiveIncomingMedia() {
  const messages = (
    await db()
      .query(`SELECT m.id,m.conversation_id,m.type,m.attachment,m.case_id,c.channel FROM alc_atendimento.messages m
    JOIN alc_atendimento.conversations c ON c.id=m.conversation_id
    LEFT JOIN alc_atendimento.media a ON a.message_id=m.id
    WHERE m.direction='in' AND m.type IN ('image','audio','video','document','sticker') AND m.attachment->>'id' IS NOT NULL
    AND (a.id IS NULL OR (a.origin='inbound' AND a.status='failed' AND a.attempts<5 AND a.retention_until>now() AND a.updated_at<now()-interval '5 minutes')) ORDER BY m.created_at LIMIT 5`)
  ).rows;
  for (const message of messages) {
    let id: string = randomUUID();
    const inserted = await db().query(
      `INSERT INTO alc_atendimento.media(id,message_id,conversation_id,case_id,channel,origin,filename,provider_media_id,object_key,retention_until)
      VALUES($1,$2,$3,$4,$5,'inbound',$6,$7,$8,$9) ON CONFLICT(message_id) DO UPDATE SET status='pending',attempts=alc_atendimento.media.attempts+1,updated_at=now()
      WHERE alc_atendimento.media.origin='inbound' AND alc_atendimento.media.status='failed' AND alc_atendimento.media.attempts<5 AND alc_atendimento.media.updated_at<now()-interval '5 minutes' RETURNING *`,
      [
        id,
        message.id,
        message.conversation_id,
        message.case_id,
        message.channel,
        "anexo",
        message.attachment.id,
        `media/${id}`,
        retentionUntil(),
      ],
    );
    if (!inserted.rowCount) continue;
    try {
      const row = inserted.rows[0] as Media;
      id = row.id;
      const config = await channelConfig(row.channel);
      if (
        !row.provider_media_id ||
        !/^[0-9]{1,100}$/.test(row.provider_media_id)
      )
        throw new HttpError(415, "Identificador de mídia inválido.");
      const remote = await graph(
        config,
        encodeURIComponent(row.provider_media_id!),
      );
      if (
        !Number.isSafeInteger(remote.file_size) ||
        remote.file_size <= 0 ||
        remote.file_size > MAX_MEDIA_BYTES ||
        !/^[a-f0-9]{64}$/i.test(remote.sha256)
      )
        throw new HttpError(415, "Metadados de mídia inválidos.");
      const response = await fetch(safeMetaMediaUrl(remote.url), {
        headers: { Authorization: `Bearer ${config.token}` },
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok)
        throw new HttpError(503, "Mídia original indisponível na Meta.");
      const bytes = await boundedBytes(
        response.body,
        Math.min(remote.file_size, MAX_MEDIA_BYTES),
      );
      if (
        bytes.length !== remote.file_size ||
        createHash("sha256").update(bytes).digest("hex") !==
          remote.sha256.toLowerCase()
      )
        throw new HttpError(
          415,
          "Mídia recebida não corresponde ao hash informado.",
        );
      row.filename = receivedFilename(
        message.attachment.filename,
        remote.mime_type,
      );
      await db().query(
        "UPDATE alc_atendimento.media SET filename=$2 WHERE id=$1",
        [row.id, row.filename],
      );
      await finishUpload(row, bytes, remote.mime_type);
    } catch (error) {
      await failMedia(id, error);
    }
  }
  const pending = (
    await db()
      .query(`UPDATE alc_atendimento.media SET attempts=attempts+1,updated_at=now() WHERE id IN (
    SELECT id FROM alc_atendimento.media WHERE status IN ('pending','quarantined') AND sha256<>'' AND attempts<10
    AND retention_until>now() AND updated_at<now()-interval '5 minutes' ORDER BY updated_at LIMIT 5 FOR UPDATE SKIP LOCKED) RETURNING *`)
  ).rows as Media[];
  for (const row of pending) {
    try {
      await updateScan(row, await privateBytes(row));
    } catch {
      /* Object-store/scanner outages never release an attachment. */
    }
  }
  await db().query(
    "UPDATE alc_atendimento.media SET status='failed',error='Upload interrompido. Nenhuma mensagem enviada.' WHERE status='pending' AND sha256='' AND created_at<now()-interval '2 minutes'",
  );
}
