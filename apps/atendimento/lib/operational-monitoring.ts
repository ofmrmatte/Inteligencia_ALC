import type { AuthProfile } from "@alc/identity/auth";
import { scopeFor } from "./auth";
import { db, setting } from "./db";
import { competence } from "./domain";
import { conversationScopeSql, inboxScopeSql } from "./inbox";

const knownPurchaseValue = `CASE
  WHEN jsonb_typeof(c.record->'purchaseValue') IN ('number','string')
    AND trim(c.record->>'purchaseValue') ~ '^[+-]?([0-9]+(\\.[0-9]*)?|\\.[0-9]+)([eE][+-]?[0-9]+)?$'
    AND trim(c.record->>'purchaseValue')::numeric > 0
  THEN trim(c.record->>'purchaseValue')::numeric
  ELSE NULL
END`;
const overviewCache = new Map<
  string,
  { until: number; value: Awaited<ReturnType<typeof queryOperationalOverview>> }
>();
const eventVersionCache = new Map<string, { until: number; version: string }>();

export async function operationalOverview(profile: AuthProfile) {
  const scope = await scopeFor(profile),
    conversationValues: unknown[] = [],
    conversationScope = await conversationScopeSql(profile, conversationValues),
    key = JSON.stringify([
      profile.id, profile.role, profile.baseScope, profile.siglaScope,
      scope.full, [...scope.pairs].sort(), [...scope.safe].sort(), competence(),
    ]),
    cached = overviewCache.get(key);
  if (cached && cached.until > Date.now()) return cached.value;
  const value = await queryOperationalOverview(scope, conversationScope, conversationValues);
  overviewCache.set(key, { until: Date.now() + 3_000, value });
  for (const [cacheKey, entry] of overviewCache)
    if (entry.until <= Date.now()) overviewCache.delete(cacheKey);
  return value;
}

async function queryOperationalOverview(
  scope: Awaited<ReturnType<typeof scopeFor>>,
  conversationScope: string,
  conversationValues: unknown[],
) {
  const caseValues: unknown[] = [competence()];
  const caseScope = inboxScopeSql(scope, caseValues);
  const [cases, conversations, authorship, operators, recent, queue, source, collector] =
    await Promise.all([
      db().query(
        `SELECT count(*) FILTER(WHERE c.classification<>'encerrada')::int AS open,
          count(*) FILTER(WHERE c.classification='aguardando_comprovante')::int AS proof,
          count(*) FILTER(WHERE c.classification='penalidade')::int AS penalty,
          count(*) FILTER(WHERE ${knownPurchaseValue} IS NULL)::int AS purchase_value_unknown,
          sum(${knownPurchaseValue})::text AS purchase_value_confirmed
         FROM alc_atendimento.cases c WHERE ${caseScope} AND c.competence=$1`, caseValues),
      db().query(
        `SELECT count(*)::int AS conversations,
          count(*) FILTER(WHERE c.status='human')::int AS human,
          count(*) FILTER(WHERE c.status='pending')::int AS pending,
          count(*) FILTER(WHERE c.status='bot')::int AS automated,
          coalesce(sum(c.unread),0)::int AS unread
         FROM alc_atendimento.conversations c WHERE ${conversationScope}`, conversationValues),
      db().query(
        `SELECT m.sender_kind,count(*)::int AS messages
         FROM alc_atendimento.messages m JOIN alc_atendimento.conversations c ON c.id=m.conversation_id
         WHERE ${conversationScope} GROUP BY m.sender_kind`, conversationValues),
      db().query(
        `SELECT c.assigned_to,count(*)::int AS conversations
         FROM alc_atendimento.conversations c WHERE ${conversationScope} AND c.assigned_to IS NOT NULL
         GROUP BY c.assigned_to ORDER BY conversations DESC,c.assigned_to LIMIT 50`, conversationValues),
      db().query(
        `SELECT c.case_id,c.classification,c.base_key,c.sigla,c.updated_at,
          ${knownPurchaseValue}::text AS purchase_value
         FROM alc_atendimento.cases c WHERE ${caseScope} AND c.competence=$1
         ORDER BY c.updated_at DESC,c.case_id DESC LIMIT 10`, caseValues),
      db().query(
        `SELECT c.id,c.name,c.phone,c.channel,c.status,c.unread,c.updated_at
         FROM alc_atendimento.conversations c
         WHERE ${conversationScope} AND c.status IN ('human','pending')
         ORDER BY c.unread DESC,c.updated_at DESC,c.id DESC LIMIT 10`, conversationValues),
      setting<Record<string, unknown>>("source"),
      setting<Record<string, unknown>>("collector"),
    ]);
  return {
    ...cases.rows[0],
    ...conversations.rows[0],
    competence: competence(),
    authorship: Object.fromEntries(authorship.rows.map((row) => [row.sender_kind, row.messages])),
    conversationsByOperator: operators.rows,
    recentCases: recent.rows,
    queue: queue.rows,
    source: {
      lastSync: [source?.lastSync, collector?.lastSync]
        .filter((value): value is string => typeof value === "string" && value.length > 0)
        .sort()
        .at(-1) ?? null,
      lastCompletedSync: [source?.lastSync, collector?.completed ? collector.lastSync : null]
        .filter((value): value is string => typeof value === "string" && value.length > 0)
        .sort()
        .at(-1) ?? null,
      syncStats: Object.fromEntries(Object.entries(source || {}).filter(([key, value]) =>
        key !== "lastSync" && typeof value === "number" && Number.isFinite(value))),
    },
    collector: {
      enabled: collector?.enabled === true,
      lastSync: collector?.lastSync ?? null,
      completed: collector?.completed === true,
      channelSync: collector?.channelSync || {},
    },
  };
}

export async function authorizedEventVersion(profile: AuthProfile) {
  const scope = await scopeFor(profile),
    scopeKey = JSON.stringify([
      profile.id, profile.role, profile.baseScope, profile.siglaScope,
      scope.full, [...scope.pairs].sort(), [...scope.safe].sort(),
    ]),
    cached = eventVersionCache.get(scopeKey);
  if (cached && cached.until > Date.now()) return cached.version;
  const caseValues: unknown[] = [],
    conversationValues: unknown[] = [];
  const caseScope = inboxScopeSql(scope, caseValues),
    conversationScope = await conversationScopeSql(profile, conversationValues);
  const [cases, conversations, messages, outbox, settings] = await Promise.all([
    db().query(`SELECT max(c.updated_at) AS version FROM alc_atendimento.cases c WHERE ${caseScope}`, caseValues),
    db().query(`SELECT max(c.updated_at) AS version FROM alc_atendimento.conversations c WHERE ${conversationScope}`, conversationValues),
    db().query(
      `SELECT max(m.created_at) AS version FROM alc_atendimento.messages m
       JOIN alc_atendimento.conversations c ON c.id=m.conversation_id WHERE ${conversationScope}`,
      conversationValues),
    (() => {
      const outboxValues = [...conversationValues];
      const outboxScope = inboxScopeSql(scope, outboxValues, "o");
      return db().query(
        `SELECT max(o.updated_at) AS version FROM alc_atendimento.outbox o
         LEFT JOIN alc_atendimento.conversations c ON c.id=o.conversation_id
         WHERE (o.conversation_id IS NOT NULL AND ${conversationScope})
           OR (o.conversation_id IS NULL AND ${outboxScope})`,
        outboxValues,
      );
    })(),
    db().query("SELECT max(updated_at) AS version FROM alc_atendimento.settings WHERE key IN ('source','collector')"),
  ]);
  const version = [cases, conversations, messages, outbox, settings]
    .map((result) => result.rows[0]?.version ? new Date(result.rows[0].version).toISOString() : "")
    .join("|");
  eventVersionCache.set(scopeKey, { until: Date.now() + 4_000, version });
  for (const [key, entry] of eventVersionCache)
    if (entry.until <= Date.now()) eventVersionCache.delete(key);
  return version;
}
