import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ queries: [] as { sql: string; values: unknown[] }[], scopes: 0 }));
vi.mock("../lib/auth", () => ({
  scopeFor: vi.fn(async () => ({ full: false, pairs: new Set(["TST|BASE"]), safe: new Set() })),
}));
vi.mock("../lib/inbox", () => ({
  inboxScopeSql: vi.fn((scope, values: unknown[], alias = "c") => {
    mocks.scopes++;
    values.push("TST|BASE");
    return `${alias}.scope_key=$${values.length}`;
  }),
  conversationScopeSql: vi.fn(async (_profile, values: unknown[]) => {
    values.push("profile-id");
    return `c.assigned_to=$${values.length}`;
  }),
}));
vi.mock("../lib/domain", () => ({ competence: () => "202610Q1" }));
vi.mock("../lib/db", () => ({
  db: () => ({ query: async (sql: string, values: unknown[] = []) => {
    mocks.queries.push({ sql, values });
    if (sql.includes("AS automated")) return { rows: [{ conversations: 2, human: 1, pending: 1, automated: 0, unread: 3 }] };
    if (sql.includes("sender_kind")) return { rows: [{ sender_kind: "ai", messages: 4 }] };
    if (sql.includes("assigned_to,count")) return { rows: [{ assigned_to: "profile-id", conversations: 2 }] };
    if (sql.includes("case_id,c.classification")) return { rows: [] };
    if (sql.includes("c.id,c.name,c.phone")) return { rows: [] };
    if (sql.includes("count(*) FILTER")) return { rows: [{ open: 3, proof: 1, penalty: 1, purchase_value_unknown: 2, purchase_value_confirmed: "125.50" }] };
    return { rows: [{ version: null }] };
  } }),
  setting: async (key: string) => key === "source" ? { lastSync: "2026-10-09T10:00:00.000Z", updated: 2 } : { enabled: false },
}));

import { operationalOverview } from "../lib/operational-monitoring";

beforeEach(() => { mocks.queries = []; mocks.scopes = 0; });

it("returns scoped aggregates and treats zero or malformed purchase values as unknown", async () => {
  const result = await operationalOverview({
    id: `profile-${crypto.randomUUID()}`, role: "admin", baseScope: [], siglaScope: [],
  } as never);
  expect(result).toMatchObject({
    open: 3, human: 1, pending: 1, purchase_value_unknown: 2,
    purchase_value_confirmed: "125.50", source: {
      lastSync: "2026-10-09T10:00:00.000Z",
      lastCompletedSync: "2026-10-09T10:00:00.000Z",
    },
  });
  const caseQuery = mocks.queries.find(({ sql }) => sql.includes("purchase_value_unknown"))!;
  expect(caseQuery.sql).toContain("jsonb_typeof(c.record->'purchaseValue') IN ('number','string')");
  expect(caseQuery.sql).toContain("::numeric > 0");
  expect(caseQuery.sql).not.toContain("coalesce(sum");
  expect(caseQuery.sql).toContain("c.scope_key=$2");
  expect(caseQuery.values).toEqual(["202610Q1", "TST|BASE"]);
});

it("uses only timestamp versions for scoped event invalidation", async () => {
  const { authorizedEventVersion } = await import("../lib/operational-monitoring");
  await authorizedEventVersion({
    id: `profile-${crypto.randomUUID()}`, role: "admin", baseScope: [], siglaScope: [],
  } as never);
  const eventQueries = mocks.queries.slice(-5);
  expect(eventQueries.every(({ sql }) => /max\(.*(?:updated_at|created_at)[\s\S]*/.test(sql))).toBe(true);
  expect(eventQueries.some(({ sql }) => /payload|phone|body/i.test(sql))).toBe(false);
  expect(eventQueries.some(({ sql }) => sql.includes("scope_key=$"))).toBe(true);
});
