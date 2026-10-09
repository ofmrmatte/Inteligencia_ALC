import { packageBuyerSchema, packageBuyerFields } from "@/lib/package-buyer";
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
  type Channel,
} from "@/lib/meta";
import { syncCore, upsertCases, verifyCustomerContact } from "@/lib/source";
import { combineSyncStats, type SyncStats } from "@/lib/sync-delta";
import { operationalOverview, operationalSyncSummary } from "@/lib/operational-monitoring";
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
  canReadConversation,
  conversationScopeSql,
} from "@/lib/inbox";
import {
  saveAiConfig,
  saveInstructions,
  loadInstructions,
  stepsFor,
} from "@/lib/agent-instructions";
import { aiModelCatalog } from "@/lib/ai-provider";
import { aiConfigurationStatus, testAiConnection } from "@/lib/ai-provider-service";
import {
  listOperators,
  saveOperator,
  saveCoverage,
  operationalUnits,
} from "@/lib/operator-directory";
import {
  assignCase,
  assignmentQueue,
  saveAssignmentPolicy,
} from "@/lib/assignment-engine";
import { dispatchBatch, dispatchPreview } from "@/lib/dispatch-batches";
import { mediaResponse } from "@/lib/media-response";
import {
  loadTemplateContractReview,
  previewTemplateContractDraft,
  persistTemplateContract,
  requireCentralManager,
} from "@/lib/template-contract-config";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const channel = z.enum(["driver", "client"]);
const id = z.string().uuid();
const short = z.string().trim().max(200);
const listRecord = z
  .object({
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
    packageBuyer: packageBuyerSchema.optional(),
    products: z
      .array(z.object({ title: z.string().max(600) }))
      .max(50)
      .optional(),
    deliveryAt: z.string().max(64).optional(),
  })
  .superRefine((record, ctx) => {
    if (
      record.packageBuyer &&
      record.packageBuyer.shipmentId !== record.shipmentId
    )
      ctx.addIssue({
        code: "custom",
        path: ["packageBuyer", "shipmentId"],
        message: "Comprador não corresponde ao envio.",
      });
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
  if (!row || !(await canReadConversation(profile, row)))
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
      return Response.json(
        await dispatchPreview(profile, channel.parse(query.get("channel"))),
      );
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
      const requesterScope = await scopeFor(profile);
      const units = (await operationalUnits()).filter((unit) =>
        visible(requesterScope, unit),
      );
      for (const agent of await eligibleAgents()) {
        const agentScope = await scopeFor(agent);
        if (
          target
            ? visible(agentScope, target)
            : units.some((unit) => visible(agentScope, unit))
        )
          records.push({ id: agent.id, name: agent.fullName || agent.email });
      }
      return Response.json({ records });
    }
    if (resource === "messages") {
      return Response.json(
        await conversationDetail(profile, id.parse(query.get("id")), query),
      );
    }
    if (resource === "operators")
      return Response.json(await listOperators(profile));
    if (resource === "assignments")
      return Response.json(
        await assignmentQueue(
          profile,
          z.coerce
            .number()
            .int()
            .min(0)
            .max(100000)
            .parse(query.get("offset") || 0),
          query.get("history") === "true",
          { base: query.get("base") || "", sigla: query.get("sigla") || "", owner: query.get("owner") || "", search: query.get("search") || "" },
        ),
      );
    if (resource === "assignment-policy") {
      requireAdmin(profile);
      return Response.json({ policy: await setting("assignment_policy") });
    }
    if (resource === "operational-units") {
      const scope = await scopeFor(profile);
      return Response.json({
        records: (await operationalUnits()).filter((unit) =>
          visible(scope, unit),
        ),
      });
    }
    if (resource === "media") {
      const messageId = id.parse(query.get("id"));
      const result = await db().query(
        "SELECT * FROM alc_atendimento.messages WHERE id=$1",
        [messageId],
      );
      const row = result.rows[0];
      if (!row) throw new HttpError(404, "Anexo não encontrado.");
      await conversationAccess(row.conversation_id, profile);
      const archived = (await db().query("SELECT id FROM alc_atendimento.media WHERE message_id=$1", [messageId])).rows[0];
      if (!archived) throw new HttpError(409, "Anexo ainda não arquivado. Aguarde o processamento.");
      return mediaResponse(profile, archived.id, request);
    }
    if (resource === "outbox") {
      const target = query.has("channel")
        ? channel.parse(query.get("channel"))
        : null;
      const values: unknown[] = [],
        scope = await conversationScopeSql(profile, values);
      if (target) values.push(target);
      const result = await db().query(
        `SELECT o.id,o.case_id,o.channel,o.phone,coalesce(o.delivery_status,o.status) AS status,o.error,o.created_at,o.provider_id,
          coalesce(o.base_key,c.base_key) AS base_key,coalesce(o.sigla,c.sigla) AS sigla,c.name,o.operator_name_snapshot,o.triggered_by,o.dispatch_batch_id,o.template_version,
           o.payload->>'type' AS message_type,o.payload#>>'{template,name}' AS template_name
         FROM alc_atendimento.outbox o LEFT JOIN alc_atendimento.conversations c ON c.id=o.conversation_id
         WHERE ${scope}${target ? ` AND o.channel=$${values.length}` : ""} ORDER BY o.created_at DESC,o.id DESC LIMIT 1000`,
        values,
      );
      return Response.json({
        records: result.rows,
        limit: 1000,
      });
    }
    if (resource === "overview") {
      return Response.json(await operationalOverview(profile), { headers: { "Cache-Control": "private, no-store" } });
    }
    if (resource === "sync-summary")
      return Response.json(await operationalSyncSummary(profile), { headers: { "Cache-Control": "private, no-store" } });
    requireAdmin(profile);
    if (resource === "template-contracts") {
      await requireCentralManager(profile);
      return Response.json(await loadTemplateContractReview(channel.parse(query.get("channel"))), {
        headers: { "Cache-Control": "private, no-store" },
      });
    }
    if (resource === "agent-instructions") {
      const saved = await loadInstructions();
      return Response.json({
        revision: saved.revision,
        client: stepsFor("client", saved),
        driver: stepsFor("driver", saved),
        policies: saved.policies,
      });
    }
    if (resource === "ai-config") {
      return Response.json(await aiConfigurationStatus(),
      { headers: { "Cache-Control": "private, no-store" } });
    }
    if (resource === "ai-models") return Response.json(await aiModelCatalog(profile, new URL(request.url).searchParams.get("provider")), { headers: { "Cache-Control": "private, no-store" } });
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
    if (resource === "operators")
      return Response.json(await saveOperator(profile, body));
    if (resource === "coverage")
      return Response.json(await saveCoverage(profile, body));
    if (resource === "assignments")
      return Response.json(await assignCase(profile, body));
    if (resource === "assignment-policy") {
      return Response.json(await saveAssignmentPolicy(profile, body));
    }
    if (resource === "dispatch-batch")
      return Response.json(await dispatchBatch(profile, body));
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
        stats?: SyncStats;
        lastCompletedSync?: string;
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
        ...packageBuyerFields(r.packageBuyer, r.shipmentId),
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
      const accumulatedStats = combineSyncStats(state?.syncId === parsed.syncId ? state.stats : undefined, stats);
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
            stats: accumulatedStats,
            lastCompletedSync: parsed.completed ? collectedAt : state?.lastCompletedSync,
            channelSync,
          },
          profile.id,
        ],
      );
      await audit(profile.id, "collector_import", parsed.syncId, {
        ...stats,
        channel: parsed.channel || "all",
        collectOnly: parsed.collectOnly !== false,
        completed: parsed.completed,
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
      return Response.json(await verifyCustomerContact(profile, body));
    }
    if (resource === "dispatch") {
      const parsed = z
        .object({ caseId: short.min(1), channel })
        .strict()
        .parse(body);
      const result = await dispatchBatch(profile, {
        batchId: crypto.randomUUID(),
        channel: parsed.channel,
        mode: canManageUsers(profile) ? "global" : "individual",
        caseIds: [parsed.caseId],
      });
      if (result.results[0]?.status === "blocked")
        throw new HttpError(
          409,
          result.results[0].reason || "Disparo bloqueado.",
        );
      return Response.json({
        queued: result.queued > 0,
        batchId: result.batchId,
      });
    }
    requireAdmin(profile);
    if (["agent-instructions", "ai-config", "ai-test", "template-contracts"].includes(resource)) {
      if (request.headers.get("origin") !== new URL(request.url).origin)
        throw new HttpError(403, "Origem da alteração não autorizada.");
    }
    if (resource === "template-contracts") {
      const parsed = z.object({ kind: z.enum(["preview", "save"]) }).passthrough().parse(body);
      const { kind, ...input } = parsed;
      return Response.json(kind === "preview"
        ? await previewTemplateContractDraft(profile, input)
        : await persistTemplateContract(profile, input), {
        headers: { "Cache-Control": "private, no-store" },
      });
    }
    if (resource === "ai-config") return Response.json(await saveAiConfig(profile, body));
    if (resource === "ai-test") return Response.json(await testAiConnection(profile, body), { headers: { "Cache-Control": "private, no-store" } });
    if (resource === "agent-instructions") {
      return Response.json(await saveInstructions(profile, body));
    }
    if (resource === "sync") {
      const stats = await syncCore(false, false);
      await audit(profile.id, "manual_source_sync", "core", stats);
      return Response.json(stats);
    }
    if (resource === "automation") {
      const parsed = z
        .object({
          driverNotifications: z.boolean(),
          clientOutreach: z.boolean(),
          bot: z.boolean(),
          operatorName: short.optional(),
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
        "UPDATE alc_atendimento.settings SET value=value || $1::jsonb,updated_by=$2,updated_at=now() WHERE key='automation'",
        [{ driverNotifications: parsed.driverNotifications, clientOutreach: parsed.clientOutreach, bot: parsed.bot, intervalMinutes: 30 }, profile.id],
      );
      await audit(profile.id, "automation_updated");
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
