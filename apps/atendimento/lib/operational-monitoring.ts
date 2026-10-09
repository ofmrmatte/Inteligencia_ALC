import type { AuthProfile } from "@alc/identity/auth";
import { scopeFor, visible } from "./auth";
import { db, setting } from "./db";
import { competence } from "./domain";
import { conversationScopeSql, inboxScopeSql } from "./inbox";
import { emptySyncCounts, type SyncCounts } from "./sync-delta";

const knownPurchaseValue = `CASE
  WHEN jsonb_typeof(c.record->'purchaseValue') IN ('number','string')
    AND trim(c.record->>'purchaseValue') ~ '^[+]?[0-9]{1,32}(\\.[0-9]{1,16})?([eE][+-]?[0-9]{1,3})?$'
  THEN CASE WHEN trim(c.record->>'purchaseValue')::numeric > 0
    THEN trim(c.record->>'purchaseValue')::numeric ELSE NULL END
  ELSE NULL
END`;
const eventVersionCache = new Map<string, { until: number; version: string }>();

export async function operationalOverview(profile: AuthProfile) {
  const scope = await scopeFor(profile),
    conversationValues: unknown[] = [],
    conversationScope = await conversationScopeSql(profile, conversationValues);
  return queryOperationalOverview(scope, conversationScope, conversationValues);
}

export function scopedSyncCounts(scope: Awaited<ReturnType<typeof scopeFor>>, stored: Record<string, unknown>) {
  const counts = emptySyncCounts();
  if (!scope.full && !Array.isArray(stored.byUnit)) return {};
  const units = scope.full ? [stored] : (stored.byUnit as Record<string, unknown>[])
    .filter(unit => unit && typeof unit.base_key === "string" && typeof unit.sigla === "string" && visible(scope, unit));
  for (const unit of units)
    for (const key of Object.keys(counts) as (keyof SyncCounts)[])
      if (typeof unit[key] === "number" && Number.isFinite(unit[key])) counts[key] += unit[key] as number;
  return counts;
}

function syncSummary(scope: Awaited<ReturnType<typeof scopeFor>>, source: Record<string, unknown>, collector: Record<string, unknown>) {
  return {
    lastSync: [source?.lastSync, collector?.lastSync]
      .filter((value): value is string => typeof value === "string" && value.length > 0).sort().at(-1) ?? null,
    lastCompletedSync: [source?.lastSync, collector?.lastCompletedSync || (collector?.completed ? collector.lastSync : null)]
      .filter((value): value is string => typeof value === "string" && value.length > 0).sort().at(-1) ?? null,
    syncStats: scopedSyncCounts(scope, String(collector?.lastSync || "") > String(source?.lastSync || "")
      ? (collector?.stats as Record<string, unknown>) || {} : source || {}),
  };
}
export async function operationalSyncSummary(profile: AuthProfile) {
  const [scope, source, collector] = await Promise.all([scopeFor(profile),
    setting<Record<string, unknown>>("source"), setting<Record<string, unknown>>("collector")]);
  return syncSummary(scope, source || {}, collector || {});
}

async function queryOperationalOverview(
  scope: Awaited<ReturnType<typeof scopeFor>>,
  conversationScope: string,
  conversationValues: unknown[],
) {
  const caseValues: unknown[] = [competence()];
  const caseScope = inboxScopeSql(scope, caseValues);
  const [cases, conversations, authorship, source, collector] =
    await Promise.all([
      db().query(
        `SELECT count(*) FILTER(WHERE c.classification<>'encerrada')::int AS open,
          count(*) FILTER(WHERE c.classification='aguardando_comprovante')::int AS proof,
          count(*) FILTER(WHERE c.classification='penalidade')::int AS penalty,
          count(*) FILTER(WHERE c.classification<>'encerrada' AND ${knownPurchaseValue} IS NULL)::int AS purchase_value_unknown,
          sum(${knownPurchaseValue}) FILTER(WHERE c.classification<>'encerrada')::text AS purchase_value_confirmed,
          sum(${knownPurchaseValue}) FILTER(WHERE c.classification='penalidade')::text AS penalty_value_confirmed,
          sum(${knownPurchaseValue}) FILTER(WHERE c.classification='aguardando_comprovante')::text AS proof_value_confirmed
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
      setting<Record<string, unknown>>("source"),
      setting<Record<string, unknown>>("collector"),
    ]);
  return {
    ...cases.rows[0],
    ...conversations.rows[0],
    competence: competence(),
    authorship: Object.fromEntries(authorship.rows.map((row) => [row.sender_kind, row.messages])),
    source: syncSummary(scope, source || {}, collector || {}),
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
