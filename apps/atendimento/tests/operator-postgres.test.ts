import { readFile } from "node:fs/promises";
import pg from "pg";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { AuthProfile } from "@alc/identity/auth";
const identities = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        limit: async () => ({ data: identities.rows, error: null }),
      }),
    }),
  }),
}));
import { migrate } from "../scripts/migrations.mjs";
import { assignCase, saveAssignmentPolicy } from "../lib/assignment-engine";
import { saveOperator } from "../lib/operator-directory";
import { scopeFor } from "../lib/auth";
import { db, core } from "../lib/db";
import { listConversations, mutateConversation } from "../lib/inbox";
import { queueText } from "../lib/worker";
import { authorizedFolder, createEvidenceFolder } from "../lib/evidence-store";

const url = process.env.ATENDIMENTO_TEST_DATABASE_URL,
  coreUrl = process.env.ATENDIMENTO_TEST_CORE_URL;
const A = "22222222-2222-4222-8222-222222222222",
  B = "33333333-3333-4333-8333-333333333333",
  ADMIN = "44444444-4444-4444-8444-444444444444";
const profile = (
  id: string,
  role: AuthProfile["role"] = "supervisor",
): AuthProfile => ({
  id,
  role,
  fullName: `Synthetic ${id[0]}`,
  email: "synthetic@example.test",
  globalAccess: false,
  baseScope: [],
  siglaScope: [],
  atendimentoAccess: true,
});
const manager = profile(ADMIN, "developer");
function localTestUrl(value: string | undefined, name: string) {
  if (!value) throw new Error("Local PostgreSQL test connection required");
  const parsed = new URL(value);
  if (
    !["localhost", "127.0.0.1"].includes(parsed.hostname) ||
    parsed.pathname !== `/${name}`
  )
    throw new Error("Refusing non-local or non-test database");
  return value;
}
describe.skipIf(!url || !coreUrl)(
  "PostgreSQL migrations, assignments and authorship (isolated)",
  () => {
    let client: pg.Client, source: pg.Client;
    beforeAll(async () => {
      client = new pg.Client({
        connectionString: localTestUrl(url, "alc_atendimento_test"),
      });
      source = new pg.Client({
        connectionString: localTestUrl(coreUrl, "alc_core_test"),
      });
      await client.connect();
      await source.connect();
      vi.stubEnv("ATENDIMENTO_DATABASE_URL", url!);
      vi.stubEnv("CORE_DATABASE_URL", coreUrl!);
      vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "synthetic");
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.test");
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "synthetic");
      await source.query(
        `CREATE TABLE IF NOT EXISTS public.operational_units(unit_key text PRIMARY KEY,base_key text,sigla text,base_name text,xpt_code text,coordinator_name text,active boolean); CREATE TABLE IF NOT EXISTS public.operational_unit_supervisors(unit_key text,supervisor_name text,active boolean)`,
      );
      await source.query(
        "TRUNCATE public.operational_unit_supervisors,public.operational_units",
      );
      await source.query(
        "INSERT INTO public.operational_units VALUES('test-a','TEST BASE A','TEST-A','Synthetic A','','',true),('test-b','TEST BASE B','TEST-B','Synthetic B','','',true)",
      );
      await client.query("BEGIN");
      await client.query(
        await readFile(
          new URL("../db/001_atendimento.sql", import.meta.url),
          "utf8",
        ),
      );
      await client.query("COMMIT");
      await migrate(client);
      await migrate(client);
    }, 30000);
    beforeEach(async () => {
      identities.rows = [A, B, ADMIN].map((id) => ({
        id,
        role: id === ADMIN ? "developer" : "supervisor",
        active: true,
        full_name: `Synthetic ${id[0]}`,
        email: "synthetic@example.test",
      }));
      await client.query(
        "TRUNCATE alc_atendimento.assignment_history,alc_atendimento.case_assignments,alc_atendimento.operator_bases,alc_atendimento.operators,alc_atendimento.evidence_images,alc_atendimento.evidence_folders,alc_atendimento.messages,alc_atendimento.outbox,alc_atendimento.conversations,alc_atendimento.cases,alc_atendimento.audit RESTART IDENTITY",
      );
      await client.query(
        "DELETE FROM alc_atendimento.settings WHERE key LIKE 'access_%'",
      );
      await client.query(
        "UPDATE alc_atendimento.settings SET value='{\"mode\":\"manual\"}' WHERE key='assignment_policy'",
      );
      await client.query(
        "INSERT INTO alc_atendimento.cases(case_id,competence,base_key,sigla,classification,record) VALUES('test-case','202610Q1','TEST BASE A','TEST-A','aguardando_comprovante','{}')",
      );
    });
    afterAll(async () => {
      if (client) await client.end();
      if (source) await source.end();
      if (url && coreUrl) {
        await db().end();
        await core().end();
      }
      vi.unstubAllEnvs();
    });
    const enroll = (id: string, unitKey = "test-a") =>
      saveOperator(manager, {
        userId: id,
        roles: ["agent"],
        active: true,
        available: true,
        receiving: true,
        bases: [{ unitKey, responsibility: "primary" }],
      });
    it("applies legacy-to-versioned migration twice without enrollment", async () => {
      expect(
        (
          await client.query(
            "SELECT name FROM alc_atendimento.schema_migrations ORDER BY name",
          )
        ).rows,
      ).toHaveLength(2);
      expect(
        (await client.query("SELECT * FROM alc_atendimento.operators"))
          .rowCount,
      ).toBe(0);
      await client.query(
        "UPDATE alc_atendimento.schema_migrations SET sha256='changed' WHERE name='002_operators_and_assignments.sql'",
      );
      await expect(migrate(client)).rejects.toThrow("alterada");
      const sql = await readFile(
        new URL("../db/002_operators_and_assignments.sql", import.meta.url),
        "utf8",
      );
      const { createHash } = await import("node:crypto");
      await client.query(
        "UPDATE alc_atendimento.schema_migrations SET sha256=$1 WHERE name='002_operators_and_assignments.sql'",
        [createHash("sha256").update(sql).digest("hex")],
      );
    });
    it("persists membership and narrows legacy global scope without changing identity", async () => {
      expect((await scopeFor(profile(A))).pairs.size).toBe(0);
      await enroll(A);
      expect([...(await scopeFor(profile(A))).pairs]).toEqual([
        "TEST-A|TEST BASE A",
      ]);
      expect((await scopeFor(profile(A))).full).toBe(false);
    });
    it("allows only one winner of simultaneous assignments and preserves history", async () => {
      await enroll(A);
      await enroll(B);
      const results = await Promise.allSettled(
        [A, B].map((assignedTo) =>
          assignCase(manager, {
            caseId: "test-case",
            assignedTo,
            version: 0,
            reason: "Synthetic assignment",
          }),
        ),
      );
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(
        (await client.query("SELECT * FROM alc_atendimento.assignment_history"))
          .rowCount,
      ).toBe(1);
      expect(
        (
          await client.query(
            "SELECT version FROM alc_atendimento.case_assignments",
          )
        ).rows[0].version,
      ).toBe(1);
    });
    it("rejects a cross-base target and rolls back without an assignment", async () => {
      await enroll(B, "test-b");
      await expect(
        assignCase(manager, {
          caseId: "test-case",
          assignedTo: B,
          version: 0,
          reason: "Cross base",
        }),
      ).rejects.toMatchObject({ status: 403 });
      expect(
        (await client.query("SELECT * FROM alc_atendimento.case_assignments"))
          .rowCount,
      ).toBe(0);
    });
    it("keeps automatic mode disabled, then uses explicit operator membership", async () => {
      await enroll(A);
      await expect(
        assignCase(
          null,
          { caseId: "test-case", assignedTo: null, version: 0, reason: "Auto" },
          true,
        ),
      ).resolves.toEqual({ assigned: false });
      await client.query(
        "UPDATE alc_atendimento.settings SET value='{\"mode\":\"primary_then_least_loaded\"}' WHERE key='assignment_policy'",
      );
      expect(
        await assignCase(
          null,
          { caseId: "test-case", assignedTo: null, version: 0, reason: "Auto" },
          true,
        ),
      ).toMatchObject({ assignedTo: A });
    });
    it("does not reactivate a centrally disabled identity", async () => {
      identities.rows[0].active = false;
      await expect(enroll(A)).rejects.toMatchObject({ status: 403 });
      expect(
        (await client.query("SELECT * FROM alc_atendimento.operators"))
          .rowCount,
      ).toBe(0);
    });
    it("does not assign a manager while reopening and blocks takeover without enrollment", async () => {
      const row = (
        await client.query(
          "INSERT INTO alc_atendimento.conversations(channel,phone,base_key,sigla,case_id,status) VALUES('client','5500000000000','TEST BASE A','TEST-A','test-case','resolved') RETURNING id",
        )
      ).rows[0];
      await mutateConversation(manager, { id: row.id, action: "reopen" });
      expect(
        (
          await client.query(
            "SELECT assigned_to FROM alc_atendimento.conversations WHERE id=$1",
            [row.id],
          )
        ).rows[0].assigned_to,
      ).toBeNull();
      await expect(
        mutateConversation(manager, { id: row.id, action: "takeover" }),
      ).rejects.toMatchObject({ status: 403 });
      expect(
        (await client.query("SELECT * FROM alc_atendimento.case_assignments"))
          .rowCount,
      ).toBe(0);
    });
    it("takes over a PNR atomically and cancels stale human replies on transfer", async () => {
      await enroll(A);
      await enroll(B);
      const row = (
        await client.query(
          "INSERT INTO alc_atendimento.conversations(channel,phone,base_key,sigla,case_id,status,last_inbound_at) VALUES('client','5500000000000','TEST BASE A','TEST-A','test-case','bot',now()) RETURNING id",
        )
      ).rows[0];
      await mutateConversation(profile(A), { id: row.id, action: "takeover" });
      await mutateConversation(profile(A), {
        id: row.id,
        action: "reply",
        body: "Must not be sent after transfer",
      });
      await assignCase(manager, {
        caseId: "test-case",
        assignedTo: B,
        version: 1,
        reason: "Synthetic transfer",
      });
      expect(
        (await client.query("SELECT status FROM alc_atendimento.outbox"))
          .rows[0].status,
      ).toBe("cancelled");
      expect(
        (
          await client.query(
            "SELECT assigned_to FROM alc_atendimento.conversations",
          )
        ).rows[0].assigned_to,
      ).toBe(B);
      expect(
        (
          await client.query(
            "SELECT * FROM alc_atendimento.assignment_history ORDER BY version",
          )
        ).rows.map((r) => r.version),
      ).toEqual([1, 2]);
      await expect(
        mutateConversation(profile(A), {
          id: row.id,
          action: "reply",
          body: "Forbidden",
        }),
      ).rejects.toMatchObject({ status: 404 });
    });
    it("keeps canonical sigla separate from manual labels and applies filters before paging", async () => {
      await enroll(A);
      await client.query(
        "INSERT INTO alc_atendimento.conversations(channel,phone,base_key,sigla,case_id,status,assigned_to,labels,priority,unread,last_inbound_at) VALUES('client','5500000000000','TEST BASE A','TEST-A','test-case','human',$1,'{manual}','urgent',1,now()-interval '2 hours')",
        [A],
      );
      const list = await listConversations(profile(A), {
        priority: "urgent",
        sigla: "TEST-A",
        classification: "aguardando_comprovante",
        waitingMinutes: "60",
      });
      expect(list.total).toBe(1);
      expect(list.records[0]).toMatchObject({
        labels: ["manual"],
        operational_labels: ["TEST-A"],
      });
      expect(
        (await listConversations(profile(A), { priority: "normal" })).total,
      ).toBe(0);
    });
    it("records policy changes with audit in the same transaction", async () => {
      await saveAssignmentPolicy(manager, {
        mode: "primary_then_least_loaded",
      });
      expect(
        (
          await client.query(
            "SELECT value FROM alc_atendimento.settings WHERE key='assignment_policy'",
          )
        ).rows[0].value.mode,
      ).toBe("primary_then_least_loaded");
      expect(
        (
          await client.query(
            "SELECT actor_id FROM alc_atendimento.audit WHERE action='assignment_policy_changed'",
          )
        ).rows[0].actor_id,
      ).toBe(ADMIN);
      await expect(
        saveAssignmentPolicy(profile(A), { mode: "manual" }),
      ).rejects.toMatchObject({ status: 403 });
    });
    it("keeps the PNR owner private after resuming the bot", async () => {
      await enroll(A);
      await enroll(B);
      await assignCase(manager, {
        caseId: "test-case",
        assignedTo: A,
        version: 0,
        reason: "Synthetic owner",
      });
      const row = (
        await client.query(
          "INSERT INTO alc_atendimento.conversations(channel,phone,base_key,sigla,case_id,status,assigned_to) VALUES('client','5500000000000','TEST BASE A','TEST-A','test-case','human',$1) RETURNING id",
          [A],
        )
      ).rows[0];
      await mutateConversation(profile(A), { id: row.id, action: "resume" });
      expect((await listConversations(profile(B), {})).total).toBe(0);
      expect((await listConversations(profile(A), {})).total).toBe(1);
      await expect(
        mutateConversation(profile(B), { id: row.id, action: "read" }),
      ).rejects.toMatchObject({ status: 404 });
    });
    it("rejects evidence IDOR within the same base", async () => {
      await enroll(A); await enroll(B);
      await assignCase(manager, { caseId: "test-case", assignedTo: A, version: 0, reason: "Synthetic owner" });
      const row = (await client.query("INSERT INTO alc_atendimento.conversations(channel,phone,base_key,sigla,case_id,status,assigned_to) VALUES('client','5500000000000','TEST BASE A','TEST-A','test-case','resolved',$1) RETURNING id", [A])).rows[0];
      await client.query("INSERT INTO alc_atendimento.evidence_folders(case_id,conversation_id,phone,base_key,sigla,source_hash,message_count,print_count,manifest) VALUES('test-case',$1,'5500000000000','TEST BASE A','TEST-A',$2,3,1,'{}')", [row.id, "0".repeat(64)]);
      await expect(authorizedFolder(profile(B), "test-case")).rejects.toMatchObject({ status: 404 });
      await expect(createEvidenceFolder(profile(B), row.id)).rejects.toMatchObject({ status: 404 });
      await expect(authorizedFolder(profile(A), "test-case")).resolves.toMatchObject({ case_id: "test-case" });
    });
    it("does not starve the four-connection pool during simultaneous mutations", async () => {
      await enroll(A);
      const rows = [];
      for (let i = 0; i < 4; i++)
        rows.push(
          (
            await client.query(
              "INSERT INTO alc_atendimento.conversations(channel,phone,base_key,sigla,status,assigned_to) VALUES('client',$1,'TEST BASE A','TEST-A','human',$2) RETURNING id",
              [`550000000000${i}`, A],
            )
          ).rows[0],
        );
      await Promise.all(
        rows.map((row) =>
          mutateConversation(profile(A), {
            id: row.id,
            action: "note",
            body: "Concurrent synthetic note",
          }),
        ),
      );
      expect(
        (await client.query("SELECT * FROM alc_atendimento.messages")).rowCount,
      ).toBe(4);
    }, 15000);
    it("preserves legacy conversation ownership and does not invent historic authors", async () => {
      const row = (
        await client.query(
          "INSERT INTO alc_atendimento.conversations(channel,phone,base_key,sigla,case_id,status,assigned_to) VALUES('client','5500000000000','TEST BASE A','TEST-A','test-case','human',$1) RETURNING id",
          [B],
        )
      ).rows[0];
      await client.query(
        "INSERT INTO alc_atendimento.messages(conversation_id,direction,body,actor_id) VALUES($1,'out','Synthetic legacy message',$2)",
        [row.id, B],
      );
      await migrate(client);
      expect(
        (
          await client.query(
            "SELECT assigned_to FROM alc_atendimento.conversations",
          )
        ).rows[0].assigned_to,
      ).toBe(B);
      expect(
        (
          await client.query(
            "SELECT sender_kind,sender_user_id,sender_display_name_snapshot FROM alc_atendimento.messages",
          )
        ).rows[0],
      ).toMatchObject({
        sender_kind: "system",
        sender_user_id: null,
        sender_display_name_snapshot: "",
      });
      expect(
        (await client.query("SELECT * FROM alc_atendimento.case_assignments"))
          .rowCount,
      ).toBe(0);
    });
    it("records human and automated authorship without network sends", async () => {
      await enroll(A);
      const row = (
        await client.query(
          "INSERT INTO alc_atendimento.conversations(channel,phone,base_key,sigla,case_id,status,assigned_to,last_inbound_at) VALUES('client','5500000000000','TEST BASE A','TEST-A','test-case','human',$1,now()) RETURNING id",
          [A],
        )
      ).rows[0];
      await mutateConversation(profile(A), {
        id: row.id,
        action: "reply",
        body: "Synthetic reply",
      });
      const job = (
        await client.query(
          "SELECT sender_kind,sender_user_id,sender_display_name_snapshot,status FROM alc_atendimento.outbox",
        )
      ).rows[0];
      expect(job).toMatchObject({
        sender_kind: "human",
        sender_user_id: A,
        sender_display_name_snapshot: "Synthetic 2",
        status: "pending",
      });
      await mutateConversation(profile(A), {
        id: row.id,
        action: "note",
        body: "Synthetic internal note",
      });
      expect(
        (
          await client.query(
            "SELECT sender_kind,sender_user_id FROM alc_atendimento.messages",
          )
        ).rows[0],
      ).toMatchObject({ sender_kind: "human", sender_user_id: A });
      const connection = await db().connect();
      try {
        await queueText(
          {
            id: row.id,
            phone: "5500000000000",
            channel: "client",
            last_inbound_at: new Date().toISOString(),
            status: "bot",
            identity_verified: true,
            driver_id: "",
            agent_state: { step: "receipt" },
            case_id: "test-case",
            base_key: "TEST BASE A",
            sigla: "TEST-A",
          },
          "Synthetic bot reply",
          "reply:synthetic",
          null,
          connection,
        );
      } finally {
        connection.release();
      }
      expect(
        (
          await client.query(
            "SELECT sender_kind,sender_user_id,sender_display_name_snapshot FROM alc_atendimento.outbox WHERE dedupe_key='reply:synthetic'",
          )
        ).rows[0],
      ).toMatchObject({
        sender_kind: "ai",
        sender_user_id: null,
        sender_display_name_snapshot: "Agente virtual",
      });
    });
  },
);
