import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  eventRows: [] as Record<string, unknown>[],
  snapshots: [] as Record<string, unknown>[],
  patches: [] as Record<string, unknown>[],
  existingCapture: new Date("2026-09-18T01:17:56.000Z"),
}));

vi.mock("@/lib/auth-server", () => ({
  getCurrentProfile: async () => ({ id: "55555555-5555-4555-8555-555555555555" }),
}));
vi.mock("@/lib/access-control", () => ({
  canAccessSection: () => true,
}));
vi.mock("@/lib/access-scope-server", () => ({
  getUserAccessScope: async () => ({}),
}));
vi.mock("@/lib/access-scope", () => ({
  canAccessScopedRecord: () => true,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (name: string) => {
      const builder = {
        action: "",
        select(_fields: string) { this.action = "select"; return this; },
        eq(_column: string, _value: unknown) {
          if (this.action === "update") return Promise.resolve({ error: null });
          return this;
        },
        in(_column: string, _values: string[]) {
          return Promise.resolve({ data: [{
            event_id: "event-1", first_captured_at: mock.existingCapture,
            actor_name: null, actor_user_id: null,
          }], error: null });
        },
        order(_field: string) { return this; },
        maybeSingle() {
          return Promise.resolve({ data: {
            case_id: "197162479", base_key: "BASE", sigla: "BR",
            main_status: "IN_PROGRESS", reviewed_status: "",
            detail_sync_attempts: 0,
            detail_last_attempt_at: new Date("2026-09-19T13:30:00.000Z"),
            timeline_synced_at: new Date("2026-09-20T13:30:00.000Z"),
            raw_snapshot_jsonb: { detailSnapshot: { buyerName: "Comprador já registrado" } },
          }, error: null });
        },
        upsert(rows: Record<string, unknown>[]) {
          if (name === "pnr_case_events") mock.eventRows = rows;
          if (name === "pnr_case_detail_snapshots") mock.snapshots = rows;
          return Promise.resolve({ error: null });
        },
        update(payload: Record<string, unknown>) {
          mock.patches.push(payload);
          this.action = "update";
          return this;
        },
        insert() { return Promise.resolve({ error: null }); },
        then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
          return Promise.resolve({ data: [], error: null }).then(resolve, reject);
        },
      };
      return builder;
    },
  }),
}));

import { POST } from "@/app/api/pnr-case-center/timeline/route";

beforeEach(() => {
  mock.eventRows = [];
  mock.snapshots = [];
  mock.patches = [];
});

describe("persistência real do endpoint de timelines PNR", () => {
  it("não envia o texto Date.toString para TIMESTAMPTZ e preserva a primeira captura", async () => {
    const body = {
      caseId: "197162479",
      status: "COMPLETE",
      sourceEventCount: 1,
      events: [{
        eventId: "event-1",
        eventType: "CREATE_CASE_BY_CONSUMER",
        dateCreated: "2026-09-18T01:17:56.000Z",
      }],
    };
    const response = await POST(new Request("https://inteligencia.example.com/api/pnr-case-center/timeline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }));
    expect(response.status).toBe(200);
    expect(mock.eventRows).toHaveLength(1);
    expect(mock.eventRows[0].first_captured_at).toBe("2026-09-18T01:17:56.000Z");
    expect(mock.eventRows[0].date_created).toBe("2026-09-18T01:17:56.000Z");
    expect(mock.snapshots[0].captured_at).toBe("2026-09-20T13:30:00.000Z");
    expect(mock.patches.at(-1)?.detail_last_attempt_at).toBe("2026-09-19T13:30:00.000Z");
  });
});
