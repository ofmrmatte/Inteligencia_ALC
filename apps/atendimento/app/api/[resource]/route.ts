import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  currentProfile,
  requireAdmin,
  scopeFor,
  visible,
  HttpError,
  authConfig,
} from "@/lib/auth";
import { db, setting, audit, core } from "@/lib/db";
import {
  channelConfig,
  templates,
  encrypt,
  graph,
  type Channel,
} from "@/lib/meta";
import {
  syncCore,
  upsertCases,
  queueTemplate,
  type Automation,
} from "@/lib/source";
import {
  competence,
  classification,
  phone,
  normalize,
  type CaseRecord,
} from "@/lib/domain";
import {
  canAccessAtendimento,
  canManageUsers,
  canManageRole,
  isUserRole,
} from "@alc/identity/auth";
import {
  listConversations,
  conversationDetail,
  eligibleAgents,
  mutateConversation,
  inboxScopeSql,
} from "@/lib/inbox";
import {
  agentSettingsSchema, editableInstructionSchema, policiesSchema, effectiveInstructions,
  INSTRUCTION_KEY, validateEditedScript, loadInstructions, stepsFor,
} from "@/lib/agent-instructions";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const channel = z.enum(["driver", "client"]);
const id = z.string().uuid();
const short = z.string().trim().max(200);
const listRecord = z.object({
  caseId: z.string().regex(/^\d{1,30}$/),
  shipmentId: z.string().min(1).max(120),
  caseDate: z.string().max(64),
  originStation: short,
  driverName: short,
  mainStatus: short,
  subStatus: short,
  purchaseValue: z.number().nonnegative().finite(),
  driverId: short.optional(),
  driverPhone: short.optional(),
  customerName: short.optional(),
  customerPhone: short.optional(),
  products: z
    .array(z.object({ title: z.string().max(600) }))
    .max(50)
    .optional(),
  deliveryAt: z.string().max(64).optional(),
});
async function allowedRows(
  table: "cases" | "conversations",
  profile: Awaited<ReturnType<typeof currentProfile>>,
) {
  const scope = await scopeFor(profile);
  const result = await db().query(
    `SELECT * FROM alc_atendimento.${table} ORDER BY updated_at DESC LIMIT 10000`,
  );
  return result.rows.filter((row) => visible(scope, row));
}
async function conversationAccess(
  conversationId: string,
  profile: Awaited<ReturnType<typeof currentProfile>>,
) {
  const result = await db().query(
    "SELECT * FROM alc_atendimento.conversations WHERE id=$1",
    [conversationId],
  );
  const row = result.rows[0];
  if (!row || !visible(await scopeFor(profile), row))
    throw new HttpError(404, "Atendimento não encontrado.");
  return row;
}
function errorResponse(error: unknown) {
  if (error instanceof HttpError)
    return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof z.ZodError)
    return Response.json(
      { error: "Dados inválidos. Revise os campos informados." },
      { status: 400 },
    );
  if (
    error instanceof Error &&
    [
      "Telefone não validado.",
      "Contato inicial limitado à competência vigente.",
      "PNR encerrada.",
      "Classificação fora da tratativa de clientes.",
      "Modelo aprovado indisponível.",
      "Fora da janela de 24h: é necessário modelo aprovado para esta classificação.",
      "Cliente já possui uma tratativa ativa para outro envio. Revisão da equipe necessária.",
      "Uma tratativa de outro envio está ativa para este cliente.",
      "Janela de atendimento encerrada. Use um modelo aprovado.",
      "Canal não configurado.",
    ].includes(error.message)
  )
    return Response.json({ error: error.message }, { status: 400 });
  return Response.json(
    { error: "Operação indisponível. Tente novamente." },
    { status: 503 },
  );
}
export async function GET(
  request: Request,
  { params }: { params: Promise<{ resource: string }> },
) {
  try {
    const profile = await currentProfile(),
      { resource } = await params,
      query = new URL(request.url).searchParams;
    if (resource === "profile")
      return Response.json({ profile, admin: canManageUsers(profile) });
    if (resource === "cases") {
      const records = await allowedRows("cases", profile);
      const search = normalize(query.get("q"));
      return Response.json({
        records: records.filter(
          (r) =>
            !search || normalize(JSON.stringify(r.record)).includes(search),
        ),
        competence: competence(),
      });
    }
    if (resource === "dispatch-preview") {
      // ponytail: bounded previews; move filters/paging server-side if scoped reads reach 10k cases.
      const target = channel.parse(query.get("channel")), values: unknown[] = [];
      const scope = inboxScopeSql(await scopeFor(profile), values);
      values.push(target);
      const bind = `$${values.length}`;
      const result = await db().query(
        `SELECT c.case_id,c.competence,c.classification,c.record,o.status AS initial_status
         FROM alc_atendimento.cases c LEFT JOIN alc_atendimento.outbox o
           ON o.dedupe_key=${bind}||':'||c.case_id||':'||CASE WHEN ${bind}='driver' THEN c.driver_phone ELSE c.customer_phone END||':initial'
         WHERE ${scope} ORDER BY c.updated_at DESC,c.case_id DESC LIMIT 10000`, values,
      );
      return Response.json({ records: result.rows, competence: competence(), limit: 10000 });
    }
    if (resource === "conversations")
      return Response.json(
        await listConversations(profile, Object.fromEntries(query)),
      );
    if (resource === "agents") {
      const target = query.get("id")
        ? await conversationAccess(id.parse(query.get("id")), profile)
        : null;
      const records = [];
      for (const agent of await eligibleAgents()) {
        if (!target || visible(await scopeFor(agent), target))
          records.push({ id: agent.id, name: agent.fullName || agent.email });
      }
      return Response.json({ records });
    }
    if (resource === "messages") {
      return Response.json(
        await conversationDetail(profile, id.parse(query.get("id")), query),
      );
    }
    if (resource === "media") {
      const messageId = id.parse(query.get("id"));
      const result = await db().query(
        "SELECT * FROM alc_atendimento.messages WHERE id=$1",
        [messageId],
      );
      const row = result.rows[0];
      if (!row?.attachment?.id)
        throw new HttpError(404, "Anexo não encontrado.");
      const conversation = await conversationAccess(
          row.conversation_id,
          profile,
        ),
        cfg = await channelConfig(conversation.channel);
      const media = await graph(cfg, String(row.attachment.id)),
        url = new URL(media.url);
      if (
        url.protocol !== "https:" ||
        !["lookaside.fbsbx.com", "lookaside.facebook.com"].includes(
          url.hostname,
        )
      )
        throw new HttpError(502, "Origem de anexo inválida.");
      if (Number(media.file_size) > 25 * 1024 * 1024)
        throw new HttpError(413, "Anexo excede 25 MB.");
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${cfg.token}` },
        redirect: "error",
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new HttpError(502, "Anexo indisponível na Meta.");
      return new Response(response.body, {
        headers: {
          "Content-Type": media.mime_type || "application/octet-stream",
          "Content-Disposition": 'attachment; filename="anexo-pnr"',
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    if (resource === "outbox") {
      const target = query.has("channel") ? channel.parse(query.get("channel")) : null;
      const values: unknown[] = [], scope = inboxScopeSql(await scopeFor(profile), values);
      if (target) values.push(target);
      const result = await db().query(
        `SELECT o.id,o.case_id,o.channel,o.phone,o.status,o.error,o.created_at,o.provider_id,c.base_key,c.sigla,c.name,
           o.payload->>'type' AS message_type,o.payload#>>'{template,name}' AS template_name
         FROM alc_atendimento.outbox o LEFT JOIN alc_atendimento.conversations c ON c.id=o.conversation_id
         WHERE ${scope}${target ? ` AND o.channel=$${values.length}` : ""} ORDER BY o.created_at DESC,o.id DESC LIMIT 1000`, values,
      );
      return Response.json({
        records: result.rows, limit: 1000,
      });
    }
    if (resource === "overview") {
      const scope = await scopeFor(profile),
        caseValues: unknown[] = [],
        conversationValues: unknown[] = [];
      const caseScope = inboxScopeSql(scope, caseValues),
        conversationScope = inboxScopeSql(scope, conversationValues);
      caseValues.push(competence());
      const [cases, conversations, source, collector, queue] =
        await Promise.all([
          db().query(
            `SELECT count(*) FILTER(WHERE classification<>'encerrada')::int AS open,count(*) FILTER(WHERE classification='aguardando_comprovante')::int AS proof,count(*) FILTER(WHERE classification='penalidade')::int AS penalty FROM alc_atendimento.cases c WHERE ${caseScope} AND competence=$${caseValues.length}`,
            caseValues,
          ),
          db().query(
            `SELECT count(*)::int AS conversations,count(*) FILTER(WHERE status='human')::int AS human,count(*) FILTER(WHERE status='pending')::int AS pending,coalesce(sum(unread),0)::int AS unread FROM alc_atendimento.conversations c WHERE ${conversationScope}`,
            conversationValues,
          ),
          setting<{ lastSync?: string }>("source"),
          setting<{
            enabled?: boolean;
            lastSync?: string;
            completed?: boolean;
            channelSync?: Record<string, { lastSync: string; completed: boolean }>;
          }>("collector"),
          db().query(
            `SELECT id,name,phone,channel,status,unread,updated_at FROM alc_atendimento.conversations c WHERE ${conversationScope} AND status IN ('human','pending') ORDER BY unread DESC,updated_at DESC,id DESC LIMIT 10`,
            conversationValues,
          ),
        ]);
      return Response.json({
        ...cases.rows[0],
        ...conversations.rows[0],
        source: {
          lastSync: [source?.lastSync, collector?.lastSync]
            .filter(Boolean)
            .sort()
            .at(-1),
        },
        collector: {
          enabled: collector?.enabled || false,
          lastSync: collector?.lastSync || null,
          completed: collector?.completed || false,
          channelSync: collector?.channelSync || {},
        },
        queue: queue.rows,
        competence: competence(),
      });
    }
    requireAdmin(profile);
    if (resource === "agent-instructions") {
      const saved = await loadInstructions();
      return Response.json({ revision: saved.revision, client: stepsFor("client", saved), driver: stepsFor("driver", saved), policies: saved.policies });
    }
    if (resource === "collector")
      return Response.json({ collector: await setting("collector") });
    if (resource === "admin") {
      const [automation, source, driver, client] = await Promise.all([
        setting("automation"),
        setting("source"),
        channelConfig("driver"),
        channelConfig("client"),
      ]);
      const masked = (
        cfg: Awaited<ReturnType<typeof channelConfig>>,
        name: Channel,
      ) => ({
        channel: name,
        number: cfg.number,
        phoneId: cfg.phoneId,
        wabaId: cfg.wabaId,
        tokenConfigured: Boolean(cfg.token),
        secretConfigured: Boolean(cfg.appSecret),
        verifyConfigured: Boolean(cfg.verifyToken),
        webhook: `${process.env.ATENDIMENTO_PUBLIC_URL || new URL(request.url).origin}/webhooks/whatsapp/${name}`,
      });
      return Response.json({
        automation,
        source,
        channels: [masked(driver, "driver"), masked(client, "client")],
      });
    }
    if (resource === "templates")
      return Response.json({
        records: (await templates(channel.parse(query.get("channel")))).map(
          (t) => ({
            ...t,
            components: t.components.map((c) => {
              const copy = { ...c };
              delete copy.example;
              return copy;
            }),
          }),
        ),
      });
    if (resource === "users") {
      const config = authConfig();
      if (!process.env.SUPABASE_SERVICE_ROLE_KEY)
        throw new HttpError(503, "Gestão de usuários não configurada.");
      const client = createClient(
        config.url,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        { auth: { persistSession: false, autoRefreshToken: false } },
      );
      const { data, error } = await client
        .from("profiles")
        .select("id,email,full_name,role,active,base_scope,module_scope")
        .limit(500);
      if (error) throw new HttpError(503, "Cadastro indisponível.");
      const records = [];
      for (const user of data || []) {
        if (
          user.id !== profile.id &&
          (!isUserRole(user.role) || !canManageRole(profile, user.role))
        )
          continue;
        const access = await setting<{ active: boolean }>(`access_${user.id}`);
        records.push({
          ...user,
          atendimentoActive:
            user.active !== false &&
            isUserRole(user.role) &&
            canAccessAtendimento({
              role: user.role,
              moduleScope: user.module_scope ?? undefined,
              atendimentoAccess: access?.active,
            }),
        });
      }
      return Response.json({ records });
    }
    if (resource === "audit")
      return Response.json({
        records: (
          await db().query(
            "SELECT actor_id,action,target,data,created_at FROM alc_atendimento.audit ORDER BY created_at DESC LIMIT 300",
          )
        ).rows,
      });
    throw new HttpError(404, "Operação não encontrada.");
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(
  request: Request,
  { params }: { params: Promise<{ resource: string }> },
) {
  try {
    const profile = await currentProfile(),
      { resource } = await params;
    const raw = await request.text();
    if (raw.length > 2_000_000) throw new HttpError(413, "Lote muito grande.");
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new HttpError(400, "JSON inválido.");
    }
    if (resource === "conversation") {
      return Response.json(await mutateConversation(profile, body));
    }
    if (resource === "import") {
      requireAdmin(profile);
      const parsed = z
        .object({
          syncId: z.string().uuid(),
          competence: z.string().regex(/^20\d{4}Q[12]$/),
          completed: z.boolean(),
          channel: z.enum(["client", "driver"]).nullable().optional(),
          collectOnly: z.boolean().optional(),
          records: z.array(listRecord).max(300),
        })
        .parse(body);
      if (parsed.competence !== competence())
        throw new HttpError(
          400,
          "Coleta automática limitada à competência vigente.",
        );
      const state = await setting<{
        syncId?: string;
        baseline: boolean;
        baselineComplete?: boolean;
        channelSync?: Record<string, { lastSync: string; completed: boolean }>;
        enabled?: boolean;
      }>("collector");
      const baseline =
        state?.syncId === parsed.syncId
          ? state.baseline
          : !state?.baselineComplete;
      const records: CaseRecord[] = parsed.records.map((r) => ({
        caseId: r.caseId,
        shipmentId: r.shipmentId,
        competence: parsed.competence,
        caseDate: r.caseDate,
        baseKey: r.originStation,
        sigla: r.originStation,
        driverId: r.driverId || "",
        driverName: r.driverName,
        driverPhone: phone(r.driverPhone),
        mainStatus: r.mainStatus,
        subStatus: r.subStatus,
        classification: classification(r.mainStatus, r.subStatus),
        customerName: r.customerName || "",
        customerPhone: "",
        customerVerified: false,
        products: r.products || [],
        deliveryAt: r.deliveryAt || "",
        purchaseValue: r.purchaseValue,
      }));
      // Resolve station to exactly one operational unit; ambiguous rows remain inaccessible to scoped users.
      const units = (
        await core().query(
          "SELECT base_key,sigla FROM public.operational_units WHERE active=true",
        )
      ).rows;
      for (const record of records) {
        const candidates = units.filter(
          (u) => normalize(u.sigla) === normalize(record.sigla),
        );
        if (candidates.length === 1) record.baseKey = candidates[0].base_key;
      }
      const stats = await upsertCases(
        records,
        new Date().toISOString(),
        baseline,
        profile.id,
        // Legacy extension requests omit collectOnly: default to no outbound messages.
        parsed.collectOnly === false,
      );
      const collectedAt = new Date().toISOString();
      const channelSync = { ...(state?.channelSync || {}) };
      if (parsed.channel) {
        channelSync[parsed.channel] = {
          lastSync: collectedAt,
          completed: parsed.completed,
        };
      }
      await db().query(
        `INSERT INTO alc_atendimento.settings(key,value,updated_by) VALUES('collector',$1,$2) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_by=excluded.updated_by,updated_at=now()`,
        [
          {
            ...state,
            syncId: parsed.syncId,
            baseline,
            baselineComplete: parsed.completed || state?.baselineComplete,
            lastSync: collectedAt,
            completed: parsed.completed,
            channelSync,
          },
          profile.id,
        ],
      );
      await audit(profile.id, "collector_import", parsed.syncId, {
        ...stats,
        channel: parsed.channel || "all",
        collectOnly: parsed.collectOnly !== false,
      });
      return Response.json(stats);
    }
    if (resource === "collector-state") {
      requireAdmin(profile);
      const parsed = z.object({ enabled: z.boolean() }).strict().parse(body);
      const stored =
        (await setting<Record<string, unknown>>("collector")) || {};
      await db().query(
        `INSERT INTO alc_atendimento.settings(key,value,updated_by) VALUES('collector',$1,$2) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_by=excluded.updated_by,updated_at=now()`,
        [{ ...stored, ...parsed }, profile.id],
      );
      await audit(
        profile.id,
        parsed.enabled ? "collector_enabled" : "collector_disabled",
      );
      return Response.json({ ok: true });
    }
    if (resource === "customer") {
      requireAdmin(profile);
      const parsed = z
        .object({
          caseId: short,
          name: short.min(1),
          phone: short.min(1),
          verified: z.literal(true),
          document: z.string().max(100).optional(),
          address: z.string().max(500).optional(),
          sourceUrl: z.url().max(1000).optional(),
        })
        .parse(body);
      const number = phone(parsed.phone);
      if (!number) throw new HttpError(400, "Telefone inválido.");
      const result = await db().query(
        "SELECT record FROM alc_atendimento.cases WHERE case_id=$1",
        [parsed.caseId],
      );
      if (!result.rows.length) throw new HttpError(404, "PNR não encontrada.");
      if (parsed.sourceUrl) {
        const source = new URL(parsed.sourceUrl);
        if (
          source.hostname !== "envios.adminml.com" ||
          !source.pathname.includes("package-management")
        )
          throw new HttpError(400, "Fonte do comprador inválida.");
      }
      const record = {
        ...result.rows[0].record,
        customerName: parsed.name,
        customerPhone: number,
        customerVerified: true,
        customerDocument:
          parsed.document || result.rows[0].record.customerDocument || "",
        customerAddress:
          parsed.address || result.rows[0].record.customerAddress || "",
        customerSource: parsed.sourceUrl || "validado_pela_equipe",
      };
      await db().query(
        "UPDATE alc_atendimento.cases SET record=$2,customer_phone=$3,updated_at=now() WHERE case_id=$1",
        [parsed.caseId, record, number],
      );
      await audit(profile.id, "customer_contact_verified", parsed.caseId);
      return Response.json({ ok: true });
    }
    requireAdmin(profile);
    if (resource === "agent-instructions") {
      const parsed = z.discriminatedUnion("kind", [
        z.object({
          kind: z.literal("script"),
          revision: z.number().int().nonnegative(),
          entry: editableInstructionSchema,
        }).strict(),
        z.object({
          kind: z.literal("policies"),
          revision: z.number().int().nonnegative(),
          policies: policiesSchema,
        }).strict(),
      ]).parse(body);
      const existing = await loadInstructions();
      if (existing.revision !== parsed.revision)
        throw new HttpError(409, "As instruções foram alteradas por outro administrador. Atualize antes de salvar.");
      const updated = { ...existing, revision: existing.revision + 1 };
      if (parsed.kind === "script") {
        const entry = validateEditedScript(parsed.entry);
        updated.scripts = { ...existing.scripts, [`${entry.channel}:${entry.code}`]: entry };
      } else {
        updated.policies = parsed.policies;
      }
      const result = await db().query(
        `INSERT INTO alc_atendimento.settings(key,value,updated_by) VALUES($1,$2,$3)
         ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_by=excluded.updated_by,updated_at=now()
         WHERE (alc_atendimento.settings.value->>'revision')::integer IS NOT DISTINCT FROM $4::integer
         RETURNING key`,
        [INSTRUCTION_KEY, updated, profile.id, existing.revision],
      );
      if (!result.rowCount) throw new HttpError(409, "Conflito de revisão. Recarregue as instruções.");
      await audit(profile.id, "agent_instructions_updated", parsed.kind,
        parsed.kind === "script" ? { code: parsed.entry.code, channel: parsed.entry.channel, revision: updated.revision }
          : { policies: updated.policies?.length, revision: updated.revision });
      return Response.json({ ok: true, revision: updated.revision });
    }
    if (resource === "sync") {
      const stats = await syncCore(false, false);
      await audit(profile.id, "manual_source_sync", "core", stats);
      return Response.json(stats);
    }
    if (resource === "dispatch") {
      const parsed = z.object({ caseId: short, channel }).parse(body),
        cfg = await channelConfig(parsed.channel);
      if (!cfg.appSecret)
        throw new HttpError(
          409,
          "Configure o App Secret e o webhook antes de enviar.",
        );
      const result = await db().query(
        "SELECT record,base_key,sigla FROM alc_atendimento.cases WHERE case_id=$1",
        [parsed.caseId],
      );
      if (!result.rows.length || !visible(await scopeFor(profile), result.rows[0]))
        throw new HttpError(404, "PNR não encontrada.");
      const automation = await setting<Automation>("automation");
      const queued = await queueTemplate(
        parsed.channel,
        result.rows[0].record,
        automation.operatorName,
      );
      await audit(profile.id, "manual_template_dispatch", parsed.caseId, {
        channel: parsed.channel,
        queued,
      });
      return Response.json({ queued });
    }
    if (resource === "automation") {
      const parsed = z
        .object({
          driverNotifications: z.boolean(),
          clientOutreach: z.boolean(),
          bot: z.boolean(),
          operatorName: short.min(1),
          intervalMinutes: z.literal(30),
        })
        .strict()
        .parse(body);
      for (const name of ["driver", "client"] as const)
        if (
          name === "driver" ? parsed.driverNotifications : parsed.clientOutreach
        ) {
          const cfg = await channelConfig(name);
          if (!cfg.appSecret || !cfg.token)
            throw new HttpError(
              409,
              "Configure o canal e a validação do webhook antes de ativar.",
            );
        }
      await db().query(
        "UPDATE alc_atendimento.settings SET value=$1,updated_by=$2,updated_at=now() WHERE key='automation'",
        [parsed, profile.id],
      );
      await audit(profile.id, "automation_updated");
      return Response.json({ ok: true });
    }
    if (resource === "channel") {
      const parsed = z
        .object({
          channel,
          phoneId: z.string().regex(/^\d{5,30}$/),
          wabaId: z.string().regex(/^\d{5,30}$/),
          number: short,
          token: z.string().max(3000).optional(),
          appSecret: z.string().max(200).optional(),
          verifyToken: z.string().max(200).optional(),
        })
        .strict()
        .parse(body);
      const existing =
        (await setting<Record<string, unknown>>(`channel_${parsed.channel}`)) ||
        {};
      const value = {
        ...existing,
        phoneId: parsed.phoneId,
        wabaId: parsed.wabaId,
        number: phone(parsed.number),
      };
      Object.assign(
        value,
        parsed.token ? { tokenEncrypted: encrypt(parsed.token) } : {},
        parsed.appSecret ? { secretEncrypted: encrypt(parsed.appSecret) } : {},
        parsed.verifyToken
          ? { verifyEncrypted: encrypt(parsed.verifyToken) }
          : {},
      );
      await db().query(
        "INSERT INTO alc_atendimento.settings(key,value,updated_by) VALUES($1,$2,$3) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_by=excluded.updated_by,updated_at=now()",
        [`channel_${parsed.channel}`, value, profile.id],
      );
      await audit(profile.id, "channel_updated", parsed.channel);
      return Response.json({ ok: true });
    }
    if (resource === "users") {
      const parsed = z.object({ id, active: z.boolean() }).parse(body);
      if (parsed.id === profile.id)
        throw new HttpError(400, "Você não pode bloquear seu próprio acesso.");
      const config = authConfig(),
        key = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!key) throw new HttpError(503, "Gestão indisponível.");
      const client = createClient(config.url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data, error } = await client
        .from("profiles")
        .select("id,role,active")
        .eq("id", parsed.id)
        .maybeSingle();
      if (
        error ||
        !data ||
        !isUserRole(data.role) ||
        !canManageRole(profile, data.role)
      )
        throw new HttpError(403, "Você não pode gerenciar este perfil.");
      if (
        parsed.active &&
        (data.active === false ||
          !canAccessAtendimento({ role: data.role, atendimentoAccess: true }))
      )
        throw new HttpError(
          403,
          "Este perfil não pode receber acesso ao Atendimento.",
        );
      await db().query(
        "INSERT INTO alc_atendimento.settings(key,value,updated_by) VALUES($1,$2,$3) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_by=excluded.updated_by,updated_at=now()",
        [`access_${parsed.id}`, { active: parsed.active }, profile.id],
      );
      await audit(profile.id, "user_access_updated", parsed.id, {
        active: parsed.active,
      });
      return Response.json({ ok: true });
    }
    throw new HttpError(404, "Operação não encontrada.");
  } catch (error) {
    return errorResponse(error);
  }
}
