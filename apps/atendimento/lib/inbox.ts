import { z } from "zod";
import type { PoolClient } from "pg";
import {
  canManageUsers,
  type AuthProfile,
} from "@alc/identity/auth";
import {
  HttpError,
  requireAdmin,
  scopeFor,
  visible,
  type Scope,
} from "./auth";
import { normalize, type CaseRecord } from "./domain";
import { db, audit } from "./db";
import { queueText } from "./worker";
import { eligibleOperators, requireOperator, canonicalUnit, operationalUnits, canSupervise, receivingOperator } from "./operator-directory";
import { recordAssignment } from "./assignment-engine";

const uuid = z.string().uuid();
export const inboxFilters = z.object({
  q: z.string().trim().max(200).default(""),
  channel: z.enum(["all", "driver", "client"]).default("all"),
  view: z.enum(["all", "mine", "uninteracted"]).default("all"),
  status: z
    .enum(["all", "open", "bot", "human", "pending", "resolved"])
    .default("open"),
  assignee: z
    .union([uuid, z.literal("all"), z.literal("unassigned")])
    .default("all"),
  label: z.string().trim().max(40).default(""),
  base: z.string().trim().max(250).default(""),
  sigla: z.string().trim().max(100).default(""),
  classification: z.enum(["all", "aberta", "aguardando_comprovante", "penalidade", "encerrada"]).default("all"),
  priority: z.enum(["all", "normal", "high", "urgent"]).default("all"),
  waitingMinutes: z.coerce.number().int().min(0).max(43200).default(0),
  offset: z.coerce.number().int().min(0).max(100000).default(0),
});
export const conversationActionSchema = z
  .object({
    id: uuid,
    action: z.enum([
      "takeover",
      "resume",
      "resolve",
      "reopen",
      "pending",
      "assign",
      "labels",
      "read",
      "note",
      "reply",
      "verify_driver",
      "priority",
    ]),
    body: z.string().trim().min(1).max(4000).optional(),
    assignedTo: uuid.nullable().optional(),
    labels: z.array(z.string().trim().min(1).max(40)).max(12).optional(),
    driverId: z.string().trim().min(1).max(200).optional(),
    baseKey: z.string().trim().min(1).max(200).optional(),
    priority: z.enum(["normal", "high", "urgent"]).optional(),
  })
  .strict();

// Match the domain normalizer without broadening ambiguous base/sigla scope.
const normalized = (column: string) =>
  `upper(trim(regexp_replace(regexp_replace(normalize(coalesce(${column},''),NFD),'[\u0300-\u036f]','','g'),'\\s+',' ','g')))`;
export function inboxScopeSql(scope: Scope, values: unknown[], alias = "c") {
  if (scope.full) return "TRUE";
  values.push([...scope.pairs], [...scope.safe]);
  const pair = `$${values.length - 1}::text[]`,
    safe = `$${values.length}::text[]`;
  const b = normalized(`${alias}.base_key`),
    s = normalized(`${alias}.sigla`);
  return `((${b}<>'' AND ${s}<>'' AND ${b}<>${s} AND (${s}||'|'||${b})=ANY(${pair})) OR ((${b}='' OR ${b}=${s}) AND ${s}<>'' AND ${s}=ANY(${safe})))`;
}
export async function conversationScopeSql(profile: AuthProfile, values: unknown[], alias = "c") {
  const scope = inboxScopeSql(await scopeFor(profile), values, alias);
  if (await canSupervise(profile)) return scope;
  values.push(profile.id);
  return `(${scope}) AND (${alias}.assigned_to IS NULL OR ${alias}.assigned_to=$${values.length}::uuid)
    AND NOT EXISTS(SELECT 1 FROM alc_atendimento.case_assignments a WHERE a.case_id=${alias}.case_id AND a.assigned_to IS NOT NULL AND a.assigned_to<>$${values.length}::uuid)`;
}
export async function canReadConversation(profile: AuthProfile, row: { base_key?: string; sigla?: string; assigned_to?: string | null; case_id?: string }, scope?: Scope, transaction?: PoolClient) {
  if (!visible(scope || await scopeFor(profile), row)) return false;
  if (await canSupervise(profile, transaction)) return true;
  if (row.assigned_to && row.assigned_to !== profile.id) return false;
  const owner = row.case_id ? (await (transaction || db()).query("SELECT assigned_to FROM alc_atendimento.case_assignments WHERE case_id=$1", [row.case_id])).rows[0]?.assigned_to : null;
  return !owner || owner === profile.id;
}
function operationalLabels(units: Awaited<ReturnType<typeof operationalUnits>>, row: { base_key?: string; sigla?: string }) {
  const unit = canonicalUnit(units, row);
  return unit ? [unit.sigla] : [];
}
export async function listConversations(
  profile: AuthProfile,
  query: Record<string, string>,
) {
  const filter = inboxFilters.parse(query),
    values: unknown[] = [];
  const where = [await conversationScopeSql(profile, values)];
  const bind = (value: unknown) => {
    values.push(value);
    return `$${values.length}`;
  };
  if (filter.q) {
    const term = bind(`%${filter.q.replace(/[\\%_]/g, "\\$&")}%`);
    where.push(
      `(c.name ILIKE ${term} OR c.phone ILIKE ${term} OR c.case_id ILIKE ${term} OR c.base_key ILIKE ${term})`,
    );
  }
  if (filter.channel !== "all") where.push(`c.channel=${bind(filter.channel)}`);
  if (filter.status !== "all")
    where.push(
      filter.status === "open"
        ? "c.status IN ('bot','human')"
        : `c.status=${bind(filter.status)}`,
    );
  if (filter.view === "mine")
    where.push(`c.assigned_to=${bind(profile.id)}::uuid`);
  if (filter.view === "uninteracted")
    where.push(
      "NOT EXISTS(SELECT 1 FROM alc_atendimento.messages m WHERE m.conversation_id=c.id AND m.actor_id IS NOT NULL)",
    );
  if (filter.assignee === "unassigned") where.push("c.assigned_to IS NULL");
  else if (filter.assignee !== "all")
    where.push(`c.assigned_to=${bind(filter.assignee)}::uuid`);
  if (filter.label) where.push(`${bind(filter.label)}=ANY(c.labels)`);
  if (filter.base) where.push(`c.base_key=${bind(filter.base)}`);
  if (filter.sigla) where.push(`c.sigla=${bind(filter.sigla)}`);
  if (filter.priority !== "all") where.push(`c.priority=${bind(filter.priority)}`);
  if (filter.classification !== "all") where.push(`EXISTS(SELECT 1 FROM alc_atendimento.cases p WHERE p.case_id=c.case_id AND p.classification=${bind(filter.classification)})`);
  if (filter.waitingMinutes) where.push(`c.unread>0 AND c.last_inbound_at<now()-(${bind(filter.waitingMinutes)}::int * interval '1 minute')`);
  const clause = where.join(" AND ");
  const count = await db().query(
    `SELECT count(*)::int AS total,coalesce(sum(unread),0)::int AS unread FROM alc_atendimento.conversations c WHERE ${clause}`,
    values,
  );
  const records = await db().query(
    `SELECT c.*,last_message.body AS last_message,last_message.direction AS last_direction,last_message.status AS last_message_status
    FROM alc_atendimento.conversations c LEFT JOIN LATERAL (SELECT body,direction,status FROM alc_atendimento.messages WHERE conversation_id=c.id ORDER BY created_at DESC,id DESC LIMIT 1) last_message ON true
    WHERE ${clause} ORDER BY c.updated_at DESC,c.id DESC LIMIT 30 OFFSET ${bind(filter.offset)}`,
    values,
  );
  const units = await operationalUnits();
  return {
    records: records.rows.map(row => ({ ...row, operational_labels: operationalLabels(units, row) })),
    total: count.rows[0]?.total || 0,
    unread: count.rows[0]?.unread || 0,
    limit: 30,
    offset: filter.offset,
  };
}
export async function conversationDetail(
  profile: AuthProfile,
  conversationId: string,
  query: URLSearchParams,
) {
  const scope = await scopeFor(profile);
  const conversation = (
    await db().query(
      "SELECT * FROM alc_atendimento.conversations WHERE id=$1",
      [uuid.parse(conversationId)],
    )
  ).rows[0];
  if (!conversation || !await canReadConversation(profile, conversation, scope))
    throw new HttpError(404, "Atendimento não encontrado.");
  const before = query.get("before"),
    beforeId = query.get("beforeId");
  const values: unknown[] = [conversation.id];
  let cursor = "";
  if (before || beforeId) {
    values.push(
      z.iso.datetime({ offset: true }).parse(before),
      uuid.parse(beforeId),
    );
    cursor = " AND (created_at,id)<($2::timestamptz,$3::uuid)";
  }
  const result = await db().query(
    `SELECT * FROM alc_atendimento.messages WHERE conversation_id=$1${cursor} ORDER BY created_at DESC,id DESC LIMIT 51`,
    values,
  );
  const messages = result.rows.slice(0, 50).reverse();
  const jobs = await db().query(
    `SELECT o.id,o.payload,o.status,o.error,o.created_at,o.sender_kind,o.sender_display_name_snapshot FROM alc_atendimento.outbox o WHERE o.conversation_id=$1 AND NOT EXISTS(SELECT 1 FROM alc_atendimento.messages m WHERE m.provider_id=o.provider_id) ORDER BY o.created_at DESC LIMIT 30`,
    [conversation.id],
  );
  const cases = await db().query(
    `SELECT * FROM alc_atendimento.cases WHERE case_id=$1 OR ($2<>'' AND driver_id=$2 AND driver_phone=$3 AND base_key=$4 AND sigla=$5) ORDER BY competence DESC,source_at DESC LIMIT 20`,
    [
      conversation.case_id,
      conversation.identity_verified ? conversation.driver_id : "",
      conversation.phone,
      conversation.base_key,
      conversation.sigla,
    ],
  );
  return {
    conversation: { ...conversation, operational_labels: operationalLabels(await operationalUnits(), conversation) },
    messages,
    queued: jobs.rows,
    cases: cases.rows.filter((row) => visible(scope, row)),
    hasMore: result.rows.length > 50,
  };
}
export async function eligibleAgents() {
  return eligibleOperators();
}
export async function mutateConversation(profile: AuthProfile, input: unknown) {
  const parsed = conversationActionSchema.parse(input);
  if (parsed.action === "assign" && parsed.assignedTo === undefined) throw new HttpError(400, "Informe o responsável ou remova a atribuição.");
  const operator = ["takeover", "reply"].includes(parsed.action) ? await requireOperator(profile) : null;
  if (parsed.action === "assign") requireAdmin(profile);
  if (parsed.action === "verify_driver") requireAdmin(profile);
  const scope = await scopeFor(profile);
  const target =
    parsed.action === "assign" && parsed.assignedTo
      ? (await eligibleAgents()).find((r) => r.id === parsed.assignedTo)
      : null;
  if (parsed.action === "assign" && parsed.assignedTo && !target)
    throw new HttpError(403, "Responsável sem acesso ao Atendimento.");
  const targetScope = target ? await scopeFor(target) : null;
  const assigning = ["takeover", "assign"].includes(parsed.action);
  const units = assigning || parsed.action === "verify_driver" ? await operationalUnits() : [];
  const transaction = await db().connect();
  try {
    await transaction.query("BEGIN");
    await transaction.query("SELECT pg_advisory_xact_lock(hashtext('atendimento_operator_directory'))");
    await transaction.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
      [parsed.id],
    );
    const row = (
      await transaction.query(
        "SELECT * FROM alc_atendimento.conversations WHERE id=$1 FOR UPDATE",
        [parsed.id],
      )
    ).rows[0];
    if (!row || !await canReadConversation(profile, row, await scopeFor(profile, transaction), transaction))
      throw new HttpError(404, "Atendimento não encontrado.");
    const currentOperator = operator ? await requireOperator(profile, transaction) : undefined;
    if (parsed.action === "takeover" && row.assigned_to !== profile.id && !receivingOperator(currentOperator)) throw new HttpError(403, "Recebimento de novos atendimentos está suspenso.");
    if (assigning && !canonicalUnit(units, row)) throw new HttpError(409, "Base ou sigla do atendimento ambígua.");
    if (targetScope && !visible(targetScope, row))
      throw new HttpError(
        403,
        "Responsável sem acesso à base deste atendimento.",
      );
    if (target && (!receivingOperator(await requireOperator(target, transaction)) || !visible(await scopeFor(target, transaction), row))) throw new HttpError(403, "Responsável indisponível ou sem acesso à base.");
    if (
      !["read", "note", "labels"].includes(parsed.action) &&
      row.assigned_to &&
      row.assigned_to !== profile.id &&
      !canManageUsers(profile)
    )
      throw new HttpError(
        409,
        "Atendimento assumido por outro responsável. Solicite a transferência.",
      );
    if (parsed.action === "verify_driver") {
      if (row.channel !== "driver" || !parsed.driverId || !parsed.baseKey)
        throw new HttpError(
          400,
          "Informe o motorista e a base em um atendimento de motoristas.",
        );
      const candidates = (
        await transaction.query(
          "SELECT record FROM alc_atendimento.cases WHERE driver_id=$1",
          [parsed.driverId],
        )
      ).rows
        .map((r) => r.record as CaseRecord)
        .filter((r) => normalize(r.baseKey) === normalize(parsed.baseKey));
      if (!candidates.length)
        throw new HttpError(400, "Motorista/base não localizados.");
      if (
        new Set(
          candidates.map(
            (r) => `${normalize(r.sigla)}|${normalize(r.baseKey)}`,
          ),
        ).size !== 1
      )
        throw new HttpError(
          409,
          "Motorista/base ambíguos. Revise a unidade operacional.",
        );
      const record = candidates[0];
      if (!visible(scope, { base_key: record.baseKey, sigla: record.sigla }))
        throw new HttpError(403, "Motorista fora do seu escopo.");
      if (!canonicalUnit(units, { base_key: record.baseKey, sigla: record.sigla }))
        throw new HttpError(409, "Base ou sigla do motorista ambígua.");
      if (row.case_id && (normalize(row.base_key) !== normalize(record.baseKey) || normalize(row.sigla) !== normalize(record.sigla)))
        throw new HttpError(409, "A identidade não corresponde à base da PNR vinculada.");
      await transaction.query(
        "UPDATE alc_atendimento.conversations SET driver_id=$2,base_key=$3,sigla=$4,name=$5,identity_verified=true,status='human',assigned_to=$6,agent_state=jsonb_set(agent_state,'{step}','\"staff\"'),unread=0 WHERE id=$1",
        [
          row.id,
          record.driverId,
          record.baseKey,
          record.sigla,
          record.driverName,
          row.assigned_to,
        ],
      );
      await transaction.query(
        "UPDATE alc_atendimento.cases SET driver_phone=$4,record=jsonb_set(record,'{driverPhone}',to_jsonb($4::text)) WHERE driver_id=$1 AND base_key=$2 AND sigla=$3",
        [record.driverId, record.baseKey, record.sigla, row.phone],
      );
      await transaction.query(
        "UPDATE alc_atendimento.outbox SET status='cancelled',error='Identidade validada pela equipe; fila anterior cancelada.',updated_at=now() WHERE conversation_id=$1 AND status='pending' AND (dedupe_key LIKE 'reply:%' OR dedupe_key LIKE 'staff:%')",
        [row.id],
      );
    } else if (parsed.action === "reply") {
      if (!parsed.body) throw new HttpError(400, "Informe uma mensagem.");
      if (row.status !== "human" || row.assigned_to !== profile.id)
        throw new HttpError(409, "Assuma o atendimento antes de responder.");
      await queueText(
        row,
        parsed.body,
        `staff:${crypto.randomUUID()}`,
        profile.id,
        transaction,
        profile.fullName || profile.email,
      );
    } else if (parsed.action === "note") {
      if (!parsed.body) throw new HttpError(400, "Informe uma nota.");
      await transaction.query(
        "INSERT INTO alc_atendimento.messages(conversation_id,direction,body,actor_id,sender_kind,sender_user_id,sender_display_name_snapshot) VALUES($1,'note',$2,$3,'human',$3,$4)",
        [row.id, parsed.body, profile.id, profile.fullName || profile.email],
      );
    } else if (parsed.action === "labels") {
      if (!parsed.labels) throw new HttpError(400, "Informe as etiquetas.");
      await transaction.query(
        "UPDATE alc_atendimento.conversations SET labels=$2 WHERE id=$1",
        [row.id, [...new Set(parsed.labels)]],
      );
    } else if (parsed.action === "priority") {
      if (!parsed.priority) throw new HttpError(400, "Informe a prioridade.");
      await transaction.query("UPDATE alc_atendimento.conversations SET priority=$2 WHERE id=$1", [row.id, parsed.priority]);
    } else if (parsed.action === "read") {
      await transaction.query(
        "UPDATE alc_atendimento.conversations SET unread=0 WHERE id=$1",
        [row.id],
      );
    } else {
      if (parsed.action === "assign" && parsed.assignedTo === undefined)
        throw new HttpError(
          400,
          "Informe o responsável ou remova a atribuição.",
        );
      const status =
        parsed.action === "resolve"
          ? "resolved"
          : parsed.action === "pending"
            ? "pending"
            : parsed.action === "resume"
              ? "bot"
              : "human";
      const assigned =
        parsed.action === "resume"
          ? null
          : parsed.action === "assign"
            ? parsed.assignedTo
            : parsed.action === "takeover"
              ? profile.id
              : row.assigned_to || null;
      const state = {
        ...row.agent_state,
        step:
          parsed.action === "resume"
            ? row.channel === "driver"
              ? row.identity_verified
                ? "driver_verified"
                : "driver_name"
              : "receipt"
            : "staff",
      };
      await transaction.query(
        "UPDATE alc_atendimento.conversations SET status=$2,assigned_to=$3,agent_state=$4,unread=0 WHERE id=$1",
        [row.id, status, assigned, state],
      );
      if (row.case_id && assigning) {
        const record = (await transaction.query("SELECT * FROM alc_atendimento.cases WHERE case_id=$1 FOR UPDATE", [row.case_id])).rows[0];
        const unit = record && canonicalUnit(units, record);
        if (!unit || normalize(unit.base_key) !== normalize(row.base_key) || normalize(unit.sigla) !== normalize(row.sigla)) throw new HttpError(409, "Conversa e PNR não correspondem à mesma unidade operacional.");
        const previous = (await transaction.query("SELECT assigned_to FROM alc_atendimento.case_assignments WHERE case_id=$1 FOR UPDATE", [row.case_id])).rows[0];
        if (previous?.assigned_to && previous.assigned_to !== assigned && !canManageUsers(profile)) throw new HttpError(409, "PNR atribuída a outro responsável. Solicite transferência.");
        await recordAssignment(transaction, record, assigned || null, profile.id, `Conversa: ${parsed.action}`);
        const others = (await transaction.query("SELECT id FROM alc_atendimento.conversations WHERE case_id=$1 AND id<>$2 ORDER BY id", [row.case_id, row.id])).rows;
        for (const other of others) {
          await transaction.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [other.id]);
          await transaction.query("UPDATE alc_atendimento.conversations SET assigned_to=$2,updated_at=now() WHERE id=$1", [other.id, assigned || null]);
          await transaction.query("UPDATE alc_atendimento.outbox SET status='cancelled',error='Responsável alterado; resposta anterior cancelada.',updated_at=now() WHERE conversation_id=$1 AND status='pending' AND (dedupe_key LIKE 'reply:%' OR dedupe_key LIKE 'staff:%')", [other.id]);
        }
      }
      await transaction.query(
        "UPDATE alc_atendimento.outbox SET status='cancelled',error='Atendimento alterado pela equipe; fila anterior cancelada.',updated_at=now() WHERE conversation_id=$1 AND status='pending' AND (dedupe_key LIKE 'reply:%' OR dedupe_key LIKE 'staff:%')",
        [row.id],
      );
    }
    if (parsed.action !== "read") {
      await transaction.query(
        "UPDATE alc_atendimento.conversations SET updated_at=now() WHERE id=$1",
        [row.id],
      );
      await audit(
        profile.id,
        parsed.action,
        row.id,
        parsed.action === "assign"
          ? { assignedTo: parsed.assignedTo }
          : parsed.action === "labels"
            ? { labels: parsed.labels }
            : {},
        transaction,
      );
    }
    await transaction.query("COMMIT");
    return { ok: true };
  } catch (error) {
    await transaction.query("ROLLBACK");
    throw error;
  } finally {
    transaction.release();
  }
}
