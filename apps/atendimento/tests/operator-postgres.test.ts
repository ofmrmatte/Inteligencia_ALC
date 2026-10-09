import { readFile } from "node:fs/promises";
import { randomUUID, createHash } from "node:crypto";
import sharp from "sharp";
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
const provider = vi.hoisted(() => ({
  graph: vi.fn(),
  templates: vi.fn(),
  scan: vi.fn(),
  publicBucket: false,
  objects: new Map<string, Buffer>(),
  beforeDownload: null as null | (() => Promise<void>),
}));
vi.mock("../lib/media-validation", async (original) => ({
  ...(await original()),
  scanMedia: provider.scan,
}));
vi.mock("../lib/meta", () => ({
  channelConfig: vi.fn(async () => ({
    phoneId: "synthetic-phone",
    wabaId: "synthetic-waba",
    token: "synthetic",
    appSecret: "synthetic",
  })),
  graph: provider.graph,
  templates: provider.templates,
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    storage: {
      getBucket: async () => ({
        data: { public: provider.publicBucket },
        error: null,
      }),
      from: () => ({
        upload: async (
          key: string,
          bytes: Buffer,
          options: { upsert: boolean },
        ) => {
          if (options.upsert || provider.objects.has(key))
            return { error: new Error("Refused overwrite") };
          provider.objects.set(key, Buffer.from(bytes));
          return { error: null };
        },
        download: async (key: string) => {
          await provider.beforeDownload?.();
          return { data: provider.objects.has(key) ? new Blob([new Uint8Array(provider.objects.get(key)!)]) : null, error: null };
        },
        remove: async (keys: string[]) => {
          keys.forEach((key) => provider.objects.delete(key));
          return { error: null };
        },
      }),
    },
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
import * as auth from "../lib/auth";
import { GET as evidenceIndex } from "../app/api/evidence/route";
import { db, core } from "../lib/db";
import { listConversations, mutateConversation } from "../lib/inbox";
import { queueText, processOutbox, processEvents } from "../lib/worker";
import { queueTemplate, verifyCustomerContact } from "../lib/source";
import {
  dispatchBatch,
  dispatchPreview,
  dispatchBatchSchema,
} from "../lib/dispatch-batches";
import { clientAudioNoticeText, competence, type CaseRecord } from "../lib/domain";
import { clientContract, driverContract, providerCatalog } from "./meta-contract-fixtures";
import { authorizedFolder, createEvidenceFolder, evidencePrint } from "../lib/evidence-store";
import {
  reserveUpload,
  finishUpload,
  mediaAccess,
  purgeExpiredMedia,
  archiveIncomingMedia,
} from "../lib/media-service";

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
    let client: pg.Client, source: pg.Client, png: Buffer;
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
      vi.stubEnv("ATENDIMENTO_MEDIA_BUCKET", "synthetic-private");
      png = await sharp({
        create: { width: 4, height: 4, channels: 3, background: "#ffffff" },
      })
        .png()
        .toBuffer();
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
      await client.query("BEGIN");
      try {
      provider.publicBucket = false;
      provider.beforeDownload = null;
      provider.objects.clear();
      provider.scan.mockReset().mockResolvedValue("clean");
      provider.graph
        .mockReset()
        .mockResolvedValue({ messages: [{ id: "synthetic-provider-id" }] });
      provider.templates.mockReset().mockResolvedValue(structuredClone(providerCatalog));
      identities.rows = [A, B, ADMIN].map((id) => ({
        id,
        role: id === ADMIN ? "developer" : "supervisor",
        active: true,
        full_name: `Synthetic ${id[0]}`,
        email: "synthetic@example.test",
      }));
      await client.query(
        "TRUNCATE alc_atendimento.agent_decisions,alc_atendimento.evidence_media,alc_atendimento.media,alc_atendimento.webhook_events,alc_atendimento.assignment_history,alc_atendimento.case_assignments,alc_atendimento.operator_bases,alc_atendimento.operators,alc_atendimento.evidence_images,alc_atendimento.evidence_folders,alc_atendimento.messages,alc_atendimento.outbox,alc_atendimento.meta_template_contracts,alc_atendimento.dispatch_batches,alc_atendimento.conversations,alc_atendimento.cases,alc_atendimento.audit RESTART IDENTITY",
      );
      await client.query(
        "DELETE FROM alc_atendimento.settings WHERE key LIKE 'access_%'",
      );
      for (const contract of [clientContract, driverContract]) {
        await client.query(
          "INSERT INTO alc_atendimento.meta_template_contracts(channel,revision,baseline,reviewed_by) VALUES($1,1,$2,$3)",
          [contract.channel, { ...contract, sender: { phoneId: "synthetic-phone", wabaId: "synthetic-waba" } }, ADMIN],
        );
      }
      await client.query(
        "UPDATE alc_atendimento.settings SET value='{\"mode\":\"manual\"}' WHERE key='assignment_policy'",
      );
      await client.query(
        "INSERT INTO alc_atendimento.cases(case_id,competence,base_key,sigla,classification,record) VALUES('test-case','202610Q1','TEST BASE A','TEST-A','aguardando_comprovante','{}')",
      );
      await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
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
    const currentRecord = (
      overrides: Partial<CaseRecord> = {},
    ): CaseRecord => ({
      caseId: "test-case",
      shipmentId: "synthetic-shipment",
      competence: competence(),
      caseDate: "2026-10-08",
      baseKey: "TEST BASE A",
      sigla: "TEST-A",
      driverId: "synthetic-driver",
      driverName: "Synthetic driver",
      driverPhone: "5511999990000",
      mainStatus: "NEW",
      subStatus: "WAITING_RECEIPT",
      classification: "aguardando_comprovante",
      customerName: "Synthetic buyer",
      customerPhone: "5511988880000",
      customerVerified: true,
      products: [{ title: "Synthetic product" }],
      deliveryAt: "2026-10-07T12:00:00Z",
      purchaseValue: 10,
      ...overrides,
    });
    const persistRecord = async (record = currentRecord()) => {
      await client.query(
        `INSERT INTO alc_atendimento.cases(case_id,competence,base_key,sigla,driver_id,driver_phone,customer_phone,classification,record)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(case_id) DO UPDATE SET competence=excluded.competence,base_key=excluded.base_key,sigla=excluded.sigla,driver_id=excluded.driver_id,driver_phone=excluded.driver_phone,customer_phone=excluded.customer_phone,classification=excluded.classification,record=excluded.record`,
        [
          record.caseId,
          record.competence,
          record.baseKey,
          record.sigla,
          record.driverId,
          record.driverPhone,
          record.customerPhone,
          record.classification,
          record,
        ],
      );
      return record;
    };
    const owned = async (owner = A, record = currentRecord()) => {
      await persistRecord(record);
      await enroll(owner);
      await assignCase(manager, {
        caseId: record.caseId,
        assignedTo: owner,
        version: 0,
        reason: "Synthetic assignment",
      });
      return record;
    };
    it("applies legacy-to-versioned migration twice without enrollment", async () => {
      expect(
        (
          await client.query(
            "SELECT name FROM alc_atendimento.schema_migrations ORDER BY name",
          )
        ).rows,
      ).toHaveLength(7);
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
    const mediaConversation = async () => {
      await owned(A);
      return (
        await client.query(
          "INSERT INTO alc_atendimento.conversations(channel,phone,case_id,base_key,sigla,status,assigned_to,last_inbound_at,identity_verified) VALUES('client','5511988880000','test-case','TEST BASE A','TEST-A','human',$1,now(),true) RETURNING id",
          [A],
        )
      ).rows[0].id as string;
    };
    const uploadedMedia = async (conversationId: string) => {
      const reservation = await reserveUpload(profile(A), {
        id: randomUUID(),
        conversationId,
        filename: "synthetic.png",
        mime: "image/png",
      });
      return finishUpload(reservation, png, "image/png");
    };
    const evidenceConversation = async () => {
      const conversationId = await mediaConversation();
      const media = await uploadedMedia(conversationId);
      const ids = [randomUUID(), randomUUID(), randomUUID()];
      for (const [index, id] of ids.entries()) await client.query(
        `INSERT INTO alc_atendimento.messages(id,conversation_id,case_id,provider_id,direction,body,type,status,attachment,created_at)
        VALUES($1,$2,'test-case',$3,$4,$5,$6,$7,$8,$9)`,
        [id, conversationId, `synthetic-evidence:${index}`, index === 1 ? "in" : "out",
          ["Recebeu?", "Foto recebida.", "Obrigado, tratativa concluída."][index], index === 1 ? "image" : "text",
          index === 1 ? "received" : "read", index === 1 ? { id: "synthetic-provider-media" } : null,
          new Date(Date.UTC(2026, 9, 8, 10, index))]);
      await client.query("UPDATE alc_atendimento.media SET message_id=$2 WHERE id=$1", [media.id, ids[1]]);
      await client.query("UPDATE alc_atendimento.conversations SET status='resolved' WHERE id=$1", [conversationId]);
      return { conversationId, mediaId: media.id, ids };
    };
    it("archives real media prints with original holds, manifest and immutable hashes", async () => {
      const fixture = await evidenceConversation();
      expect(await createEvidenceFolder(profile(A), fixture.conversationId)).toEqual({ caseId: "test-case", created: true });
      const folder = (await client.query("SELECT * FROM alc_atendimento.evidence_folders")).rows[0];
      expect(folder.manifest.messages).toHaveLength(3);
      expect(folder.manifest.messages[1].media.sha256).toBe(createHash("sha256").update(png).digest("hex"));
      const print = await evidencePrint(profile(A), "test-case", 1);
      expect(await sharp(print.bytes).metadata()).toMatchObject({ width: 900, height: 840 });
      expect((await client.query("SELECT legal_hold FROM alc_atendimento.media WHERE id=$1", [fixture.mediaId])).rows[0].legal_hold).toBe(true);
      expect((await client.query("SELECT * FROM alc_atendimento.evidence_media")).rowCount).toBe(1);
      expect(await createEvidenceFolder(profile(A), fixture.conversationId)).toEqual({ caseId: "test-case", created: false });
      await client.query("UPDATE alc_atendimento.media SET legal_hold=false,retention_until=now()-interval '1 day'");
      expect((await purgeExpiredMedia(true)).deleted).toBe(0);
      await client.query("UPDATE alc_atendimento.evidence_images SET image_png='changed'::bytea");
      await expect(evidencePrint(profile(A), "test-case", 1)).rejects.toMatchObject({ status: 409 });
    }, 15000);
    it("rolls back evidence if the transcript changes while private bytes are loaded", async () => {
      const fixture = await evidenceConversation();
      provider.beforeDownload = async () => { await client.query("UPDATE alc_atendimento.messages SET body='Changed after source snapshot' WHERE id=$1", [fixture.ids[2]]); };
      await expect(createEvidenceFolder(profile(A), fixture.conversationId)).rejects.toMatchObject({ status: 409 });
      expect((await client.query("SELECT * FROM alc_atendimento.evidence_folders")).rowCount).toBe(0);
      expect((await client.query("SELECT legal_hold FROM alc_atendimento.media")).rows[0].legal_hold).toBe(false);
    }, 15000);
    it.each(["quarantined", "rejected", "deleted"])("rejects incomplete evidence media status %s", async (status) => {
      const fixture = await evidenceConversation();
      await client.query("UPDATE alc_atendimento.media SET status=$2 WHERE id=$1", [fixture.mediaId, status]);
      await expect(createEvidenceFolder(profile(A), fixture.conversationId)).rejects.toMatchObject({ status: 422 });
      expect((await client.query("SELECT * FROM alc_atendimento.evidence_folders")).rowCount).toBe(0);
    });
    it("refuses mixed PNR histories and attachment-to-case misbinding", async () => {
      const fixture = await evidenceConversation();
      await client.query("INSERT INTO alc_atendimento.cases(case_id,competence,base_key,sigla,classification,record) VALUES('other-case','202610Q1','TEST BASE A','TEST-A','aberta','{}')");
      await client.query("UPDATE alc_atendimento.media SET case_id='other-case' WHERE id=$1", [fixture.mediaId]);
      await expect(createEvidenceFolder(profile(A), fixture.conversationId)).rejects.toMatchObject({ status: 422 });
      await client.query("UPDATE alc_atendimento.media SET case_id='test-case' WHERE id=$1", [fixture.mediaId]);
      await client.query("UPDATE alc_atendimento.messages SET case_id='other-case' WHERE id=$1", [fixture.ids[0]]);
      await expect(createEvidenceFolder(profile(A), fixture.conversationId)).rejects.toMatchObject({ status: 422 });
    });
    it("filters evidence before pagination against current PNR scope, not only stale folder labels", async () => {
      const fixture=await evidenceConversation();
      await createEvidenceFolder(profile(A),fixture.conversationId);
      await client.query("UPDATE alc_atendimento.cases SET base_key='TEST BASE B',sigla='TEST-B' WHERE case_id='test-case'");
      const identity=vi.spyOn(auth,"currentProfile").mockResolvedValue(profile(A));
      try {
        const result=await (await evidenceIndex()).json();
        expect(result.folders).toHaveLength(0);
        expect(result.pending).toHaveLength(0);
        await expect(authorizedFolder(profile(A),"test-case")).rejects.toMatchObject({status:404});
      } finally {identity.mockRestore();}
    },15000);
    it("archives private media with its hash and hides object references", async () => {
      const conversationId = await mediaConversation(),
        media = await uploadedMedia(conversationId);
      expect(media.status).toBe("ready");
      expect(media).not.toHaveProperty("object_key");
      expect((await mediaAccess(profile(A), media.id)).bytes).toEqual(png);
      expect(
        (
          await client.query(
            "SELECT sha256,size FROM alc_atendimento.media WHERE id=$1",
            [media.id],
          )
        ).rows[0],
      ).toEqual({
        sha256: createHash("sha256").update(png).digest("hex"),
        size: png.length,
      });
      expect(
        (
          await client.query(
            "SELECT action FROM alc_atendimento.audit WHERE action='media_access'",
          )
        ).rowCount,
      ).toBe(1);
    });
    it("blocks media enumeration by another owner even within the same base", async () => {
      const conversationId = await mediaConversation(),
        media = await uploadedMedia(conversationId);
      await enroll(B);
      await expect(mediaAccess(profile(B), media.id)).rejects.toMatchObject({
        status: 404,
      });
      await expect(
        reserveUpload(profile(B), {
          id: randomUUID(),
          conversationId,
          filename: "synthetic.png",
          mime: "image/png",
        }),
      ).rejects.toMatchObject({ status: 404 });
    });
    it.each(["unavailable", "infected"])(
      "never queues or downloads when scanner says %s",
      async (scan) => {
        const conversationId = await mediaConversation();
        provider.scan.mockResolvedValue(scan);
        const media = await uploadedMedia(conversationId);
        expect(media.status).toBe(
          scan === "infected" ? "rejected" : "quarantined",
        );
        await expect(mediaAccess(profile(A), media.id)).rejects.toMatchObject({
          status: 409,
        });
        await expect(
          mutateConversation(profile(A), {
            id: conversationId,
            action: "attachment",
            mediaId: media.id,
          }),
        ).rejects.toMatchObject({ status: 409 });
        expect(provider.graph).not.toHaveBeenCalled();
      },
    );
    it("refuses a public bucket and never overwrites a reserved upload", async () => {
      const conversationId = await mediaConversation();
      provider.publicBucket = true;
      await expect(uploadedMedia(conversationId)).rejects.toMatchObject({
        status: 503,
      });
      expect(provider.objects.size).toBe(0);
      const id = randomUUID(),
        request = {
          id,
          conversationId,
          filename: "synthetic.png",
          mime: "image/png",
        };
      await reserveUpload(profile(A), request);
      await expect(reserveUpload(profile(A), request)).rejects.toMatchObject({
        status: 409,
      });
    });
    it("limits concurrent upload reservations before reading file bodies", async () => {
      const conversationId = await mediaConversation();
      const requests = await Promise.allSettled(
        Array.from({ length: 3 }, () =>
          reserveUpload(profile(A), {
            id: randomUUID(),
            conversationId,
            filename: "synthetic.png",
            mime: "image/png",
          }),
        ),
      );
      expect(requests.filter((r) => r.status === "fulfilled")).toHaveLength(2);
      expect(requests.filter((r) => r.status === "rejected")).toHaveLength(1);
    });
    it("blocks requeueing legacy audio without deleting its historical archive", async () => {
      const conversationId = await mediaConversation(), media = await uploadedMedia(conversationId);
      await client.query("UPDATE alc_atendimento.media SET type='audio',mime='audio/ogg' WHERE id=$1", [media.id]);
      await expect(mutateConversation(profile(A), {
        id: conversationId, action: "attachment", mediaId: media.id,
      })).rejects.toMatchObject({ status: 415 });
      expect((await client.query("SELECT * FROM alc_atendimento.outbox")).rowCount).toBe(0);
      expect((await client.query("SELECT status FROM alc_atendimento.media WHERE id=$1", [media.id])).rows[0].status).toBe("ready");
      expect(provider.graph).not.toHaveBeenCalled();
    });
    it("queues media once and atomically links its confirmed message", async () => {
      const conversationId = await mediaConversation(),
        media = await uploadedMedia(conversationId);
      const request = {
        id: conversationId,
        action: "attachment",
        mediaId: media.id,
        body: "Synthetic caption",
      };
      await mutateConversation(profile(A), request);
      await mutateConversation(profile(A), request);
      expect(
        (await client.query("SELECT * FROM alc_atendimento.outbox")).rowCount,
      ).toBe(1);
      provider.graph
        .mockResolvedValueOnce({ id: "123456" })
        .mockResolvedValueOnce({
          messages: [{ id: "synthetic-media-message" }],
        });
      await processOutbox();
      expect(provider.graph).toHaveBeenLastCalledWith(
        expect.anything(),
        "synthetic-phone/messages",
        {
          messaging_product: "whatsapp",
          to: "5511988880000",
          type: "image",
          image: { id: "123456", caption: "Synthetic caption" },
        },
      );
      const row = (
        await client.query(
          "SELECT a.message_id,m.attachment,m.sender_user_id,o.status FROM alc_atendimento.media a JOIN alc_atendimento.messages m ON m.id=a.message_id JOIN alc_atendimento.outbox o ON o.media_id=a.id WHERE a.id=$1",
          [media.id],
        )
      ).rows[0];
      expect(row).toMatchObject({
        status: "sent",
        sender_user_id: A,
        attachment: { internalId: media.id },
      });
    });
    it("permits retry after a failed upload but never retries an uncertain message", async () => {
      const conversationId = await mediaConversation(),
        media = await uploadedMedia(conversationId);
      const request = {
        id: conversationId,
        action: "attachment",
        mediaId: media.id,
      };
      await mutateConversation(profile(A), request);
      provider.graph.mockRejectedValueOnce(
        new Error("Network before messaging"),
      );
      await processOutbox();
      expect(
        (await client.query("SELECT status FROM alc_atendimento.outbox"))
          .rows[0].status,
      ).toBe("failed");
      await mutateConversation(profile(A), { ...request, retry: true });
      provider.graph
        .mockResolvedValueOnce({ id: "123456" })
        .mockRejectedValueOnce(new Error("Network after messaging"));
      await processOutbox();
      expect(
        (await client.query("SELECT status FROM alc_atendimento.outbox"))
          .rows[0].status,
      ).toBe("uncertain");
      await expect(
        mutateConversation(profile(A), { ...request, retry: true }),
      ).rejects.toMatchObject({ status: 409 });
      const calls = provider.graph.mock.calls.length;
      await processOutbox();
      expect(provider.graph.mock.calls).toHaveLength(calls);
    });
    it("cancels queued media after ownership transfer without provider submission", async () => {
      const conversationId = await mediaConversation(),
        media = await uploadedMedia(conversationId);
      await mutateConversation(profile(A), {
        id: conversationId,
        action: "attachment",
        mediaId: media.id,
      });
      await enroll(B);
      await assignCase(manager, {
        caseId: "test-case",
        assignedTo: B,
        version: 1,
        reason: "Synthetic transfer",
      });
      await processOutbox();
      expect(provider.graph).not.toHaveBeenCalled();
      await expect(mediaAccess(profile(A), media.id)).rejects.toMatchObject({
        status: 404,
      });
    });
    it("plans retention without deletion and preserves files under legal hold", async () => {
      const conversationId = await mediaConversation(),
        first = await uploadedMedia(conversationId),
        held = await uploadedMedia(conversationId);
      await client.query(
        "UPDATE alc_atendimento.media SET retention_until=now()-interval '1 day',legal_hold=(id=$1) WHERE conversation_id=$2",
        [held.id, conversationId],
      );
      expect(await purgeExpiredMedia(false)).toMatchObject({
        candidates: 1,
        deleted: 0,
      });
      expect(provider.objects.size).toBe(2);
      await expect(mediaAccess(profile(A), first.id)).rejects.toMatchObject({
        status: 409,
      });
      expect((await mediaAccess(profile(A), held.id)).bytes).toEqual(png);
      expect(await purgeExpiredMedia(true)).toMatchObject({
        candidates: 1,
        deleted: 1,
      });
      expect(provider.objects.size).toBe(1);
    });
    it("archives inbound attachments without losing their original message", async () => {
      const conversationId = await mediaConversation();
      await client.query(
        "INSERT INTO alc_atendimento.messages(conversation_id,direction,body,type,attachment) VALUES($1,'in','','image',$2)",
        [conversationId, { id: "123456", filename: "inbound.png" }],
      );
      provider.graph.mockResolvedValue({
        url: "https://lookaside.fbsbx.com/whatsapp_business/attachments/?id=synthetic",
        file_size: png.length,
        mime_type: "image/png",
        sha256: createHash("sha256").update(png).digest("hex"),
      });
      const fetchMock = vi
        .fn()
        .mockResolvedValue(new Response(new Uint8Array(png)));
      vi.stubGlobal("fetch", fetchMock);
      try {
        await archiveIncomingMedia();
        await archiveIncomingMedia();
      } finally {
        vi.unstubAllGlobals();
      }
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(
        (
          await client.query(
            "SELECT status,origin,message_id FROM alc_atendimento.media",
          )
        ).rows[0],
      ).toMatchObject({ status: "ready", origin: "inbound" });
      expect(
        (await client.query("SELECT * FROM alc_atendimento.messages")).rowCount,
      ).toBe(1);
    });
    it("recovers transient inbound archival failure without another message or object", async () => {
      const conversationId = await mediaConversation();
      await client.query(
        "INSERT INTO alc_atendimento.messages(conversation_id,direction,body,type,attachment,case_id) VALUES($1,'in','','image',$2,'test-case')",
        [conversationId, { id: "123456" }],
      );
      provider.graph.mockRejectedValueOnce(new Error("Transient Meta outage"));
      await archiveIncomingMedia();
      expect(
        (await client.query("SELECT status FROM alc_atendimento.media")).rows[0]
          .status,
      ).toBe("failed");
      await client.query(
        "UPDATE alc_atendimento.media SET updated_at=now()-interval '6 minutes'",
      );
      provider.graph.mockResolvedValue({
        url: "https://lookaside.fbsbx.com/whatsapp_business/attachments/?id=synthetic",
        file_size: png.length,
        mime_type: "image/png",
        sha256: createHash("sha256").update(png).digest("hex"),
      });
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response(new Uint8Array(png))),
      );
      try {
        await archiveIncomingMedia();
      } finally {
        vi.unstubAllGlobals();
      }
      expect(
        (
          await client.query(
            "SELECT status,attempts,filename FROM alc_atendimento.media",
          )
        ).rows,
      ).toEqual([{ status: "ready", attempts: 1, filename: "anexo.png" }]);
      expect(provider.objects.size).toBe(1);
      expect(
        (await client.query("SELECT * FROM alc_atendimento.messages")).rowCount,
      ).toBe(1);
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
          "INSERT INTO alc_atendimento.conversations(channel,phone,base_key,sigla,case_id,status,assigned_to) VALUES('client','5500000000000','TEST BASE A','TEST-A','test-case','resolved',$1) RETURNING id",
          [A],
        )
      ).rows[0];
      await client.query(
        "INSERT INTO alc_atendimento.evidence_folders(case_id,conversation_id,phone,base_key,sigla,source_hash,message_count,print_count,manifest) VALUES('test-case',$1,'5500000000000','TEST BASE A','TEST-A',$2,3,1,'{}')",
        [row.id, "0".repeat(64)],
      );
      await expect(
        authorizedFolder(profile(B), "test-case"),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        createEvidenceFolder(profile(B), row.id),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        authorizedFolder(profile(A), "test-case"),
      ).resolves.toMatchObject({ case_id: "test-case" });
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
        sender_display_name_snapshot: "Ellie",
      });
    });
    async function receiveCustomerAudio(state: string) {
      await owned();
      await client.query("UPDATE alc_atendimento.settings SET value=jsonb_set(value,'{bot}','false'::jsonb) WHERE key='automation'");
      const agentState = { step: state === "bot" ? "receipt" : "human", optOut: false };
      const row = (await client.query(
        "INSERT INTO alc_atendimento.conversations(channel,phone,base_key,sigla,case_id,status,assigned_to,agent_state) VALUES('client','5511988880000','TEST BASE A','TEST-A','test-case',$1,$2,$3) RETURNING id",
        [state, A, agentState],
      )).rows[0];
      const event = { entry: [{ changes: [{ value: {
        metadata: { phone_number_id: "synthetic-phone" },
        messages: [{ id: "synthetic-audio-inbound", from: "5511988880000", timestamp: String(Math.floor(Date.now() / 1000)), type: "audio", audio: { id: "synthetic-audio-media", mime_type: "audio/ogg", voice: true } }],
      } }] }] };
      for (const eventKey of ["audio-first", "audio-duplicate"]) {
        await client.query("INSERT INTO alc_atendimento.webhook_events(event_key,channel,payload) VALUES($1,'client',$2)", [eventKey, event]);
        await processEvents();
      }
      return { id: row.id, agentState };
    }
    it.each(["human", "bot", "pending"])("confirms one fixed audio notice for %s without changing ownership or treatment", async state => {
      const { id, agentState } = await receiveCustomerAudio(state);
      await processOutbox();
      await processOutbox();
      expect(provider.graph).toHaveBeenCalledOnce();
      expect(provider.graph.mock.calls[0][2]).toMatchObject({ type: "text", text: { body: clientAudioNoticeText() } });
      expect((await client.query("SELECT status,assigned_to,agent_state FROM alc_atendimento.conversations WHERE id=$1", [id])).rows[0])
        .toEqual({ status: state, assigned_to: A, agent_state: agentState });
      expect((await client.query("SELECT status FROM alc_atendimento.outbox")).rows).toEqual([{ status: "sent" }]);
      expect((await client.query("SELECT * FROM alc_atendimento.media")).rowCount).toBe(0);
      expect(provider.objects.size).toBe(0);
    });
    it.each(["resolved", "optout"])("cancels the queued audio notice after %s without contacting the provider", async reason => {
      const { id } = await receiveCustomerAudio("human");
      if (reason === "resolved") await client.query("UPDATE alc_atendimento.conversations SET status='resolved' WHERE id=$1", [id]);
      else await client.query("UPDATE alc_atendimento.conversations SET agent_state=jsonb_set(agent_state,'{optOut}','true'::jsonb) WHERE id=$1", [id]);
      await processOutbox();
      expect(provider.graph).not.toHaveBeenCalled();
      expect((await client.query("SELECT status FROM alc_atendimento.outbox")).rows).toEqual([{ status: "cancelled" }]);
    });
    it("uses each PNR owner, never the global batch administrator name", async () => {
      const first = await owned();
      const second = await owned(
        B,
        currentRecord({
          caseId: "test-second",
          customerPhone: "5511977770000",
        }),
      );
      const batchId = "55555555-5555-4555-8555-555555555555";
      const result = await dispatchBatch(manager, {
        batchId,
        channel: "client",
        mode: "global",
        caseIds: [first.caseId, second.caseId],
      });
      expect(result.queued).toBe(2);
      const jobs = (
        await client.query(
          "SELECT * FROM alc_atendimento.outbox ORDER BY case_id",
        )
      ).rows;
      expect(jobs.map((j) => j.operator_name_snapshot)).toEqual([
        "Synthetic 2",
        "Synthetic 3",
      ]);
      for (const job of jobs) {
        expect(job.triggered_by).toBe(ADMIN);
        expect(job.dispatch_batch_id).toBe(batchId);
        expect(job.template_version).toMatch(/^[a-f0-9]{64}$/);
        expect(job.sender_kind).toBe("system");
        const name = job.payload.template.components[0].parameters.find(
          (p: { parameter_name: string }) =>
            p.parameter_name === "nome_disparou",
        );
        expect(name.text).toBe(job.operator_name_snapshot);
        expect(name.text).not.toBe("Synthetic 4");
      }
      expect(provider.graph).not.toHaveBeenCalled();
    });
    it("blocks an individual batch from another agent without taking ownership", async () => {
      await owned();
      await enroll(B);
      const result = await dispatchBatch(profile(B), {
        batchId: "55555555-5555-4555-8555-555555555555",
        channel: "client",
        mode: "individual",
        caseIds: ["test-case"],
      });
      expect(result.queued).toBe(0);
      expect(result.results[0].status).toBe("blocked");
      expect(
        (
          await client.query(
            "SELECT assigned_to FROM alc_atendimento.case_assignments",
          )
        ).rows[0].assigned_to,
      ).toBe(A);
      expect(
        (await client.query("SELECT * FROM alc_atendimento.outbox")).rows,
      ).toHaveLength(0);
    });
    it("deduplicates simultaneous individual and global requests in PostgreSQL", async () => {
      const record = await owned();
      const outcomes = await Promise.all([
        queueTemplate("client", record, profile(A)),
        queueTemplate("client", record, manager, false, { global: true }),
      ]);
      expect(outcomes.sort()).toEqual([false, true]);
      expect(
        (await client.query("SELECT * FROM alc_atendimento.outbox")).rows,
      ).toHaveLength(1);
    });
    it("does not generate another initial after phone change or uncertain outcome", async () => {
      const record = await owned();
      await queueTemplate("client", record, profile(A));
      await client.query(
        "UPDATE alc_atendimento.outbox SET status='uncertain'",
      );
      const changed = await persistRecord(
        currentRecord({ customerPhone: "5511966660000" }),
      );
      expect(await queueTemplate("client", changed, profile(A))).toBe(false);
      expect(
        (await client.query("SELECT phone,status FROM alc_atendimento.outbox"))
          .rows,
      ).toEqual([{ phone: record.customerPhone, status: "uncertain" }]);
      await processOutbox();
      expect(provider.graph).not.toHaveBeenCalled();
    });
    it("retains legacy initial history when the verified phone changes", async () => {
      const record = await owned();
      await client.query(
        "INSERT INTO alc_atendimento.outbox(dedupe_key,case_id,channel,phone,payload,status) VALUES('client:test-case:old-phone:initial','test-case','client','5500000000000','{}','sent')",
      );
      expect(await queueTemplate("client", record, profile(A))).toBe(false);
      expect(
        (await client.query("SELECT * FROM alc_atendimento.outbox")).rows,
      ).toHaveLength(1);
    });
    it("revalidates a transferred owner before provider submission and preserves the name snapshot", async () => {
      const record = await owned();
      await enroll(B);
      await queueTemplate("client", record, profile(A));
      await assignCase(manager, {
        caseId: record.caseId,
        assignedTo: B,
        version: 1,
        reason: "Synthetic transfer",
      });
      await processOutbox();
      expect(provider.graph).not.toHaveBeenCalled();
      expect(
        (
          await client.query(
            "SELECT status,operator_name_snapshot,assigned_to FROM alc_atendimento.outbox",
          )
        ).rows[0],
      ).toMatchObject({
        status: "cancelled",
        operator_name_snapshot: "Synthetic 2",
        assigned_to: A,
      });
    });
    it.each([A, ADMIN])(
      "revalidates centrally revoked identity %s immediately before submission",
      async (revoked) => {
        const record = await owned();
        await queueTemplate("client", record, manager, false, { global: true });
        identities.rows = identities.rows.filter((row) => row.id !== revoked);
        await processOutbox();
        expect(provider.graph).not.toHaveBeenCalled();
        expect(
          (await client.query("SELECT status FROM alc_atendimento.outbox"))
            .rows[0].status,
        ).toBe("cancelled");
      },
    );
    it("revalidates a suspended operator and releases every advisory lock", async () => {
      const record = await owned();
      await queueTemplate("client", record, profile(A));
      await client.query(
        "UPDATE alc_atendimento.operators SET active=false WHERE user_id=$1",
        [A],
      );
      await processOutbox();
      expect(provider.graph).not.toHaveBeenCalled();
      expect(
        (
          await client.query(
            "SELECT pg_try_advisory_lock(hashtext('atendimento_operator_directory')) AS released",
          )
        ).rows[0].released,
      ).toBe(true);
      await client.query(
        "SELECT pg_advisory_unlock(hashtext('atendimento_operator_directory'))",
      );
    });
    it("records provider confirmation without claiming a template was personally authored", async () => {
      const record = await owned();
      await queueTemplate("client", record, profile(A));
      await processOutbox();
      expect(provider.graph).toHaveBeenCalledOnce();
      expect(
        (
          await client.query(
            "SELECT status,delivery_status,provider_id FROM alc_atendimento.outbox",
          )
        ).rows[0],
      ).toMatchObject({
        status: "sent",
        delivery_status: "sent",
        provider_id: "synthetic-provider-id",
      });
      expect(
        (
          await client.query(
            "SELECT sender_kind,sender_user_id FROM alc_atendimento.messages",
          )
        ).rows[0],
      ).toEqual({ sender_kind: "system", sender_user_id: null });
    });
    it("does not permit batch nonce reuse with different PNRs or forged snapshot fields", async () => {
      await owned();
      const body = {
        batchId: "55555555-5555-4555-8555-555555555555",
        channel: "client",
        mode: "global",
        caseIds: ["test-case"],
      };
      await dispatchBatch(manager, body);
      await expect(
        dispatchBatch(manager, { ...body, caseIds: ["other-case"] }),
      ).rejects.toMatchObject({ status: 409 });
      expect(
        dispatchBatchSchema.safeParse({ ...body, operatorName: "Forged" })
          .success,
      ).toBe(false);
      expect(
        dispatchBatchSchema.safeParse({
          ...body,
          caseIds: ["test-case", "test-case"],
        }).success,
      ).toBe(false);
    });
    it("applies owner privacy and case-level initial dedupe to preview before pagination", async () => {
      await owned();
      await owned(
        B,
        currentRecord({
          caseId: "test-second",
          customerPhone: "5511977770000",
        }),
      );
      const preview = await dispatchPreview(profile(A), "client");
      expect(preview.records.map((row) => row.case_id)).toEqual(["test-case"]);
      expect(preview.records[0].operator_name).toBe("Synthetic 2");
      expect(preview.records[0].dispatch_block).toBe("");
    });
    it("serializes verified contact changes with provider submission", async () => {
      const record = await owned();
      await queueTemplate("client", record, profile(A));
      let submitted!: () => void, finish!: () => void;
      const entered = new Promise<void>((resolve) => {
        submitted = resolve;
      });
      const providerResult = new Promise<void>((resolve) => {
        finish = resolve;
      });
      provider.graph.mockImplementationOnce(async () => {
        submitted();
        await providerResult;
        return { messages: [{ id: "synthetic-provider-id" }] };
      });
      const sending = processOutbox();
      await entered;
      const contact = verifyCustomerContact(manager, {
        caseId: record.caseId,
        name: "Synthetic updated buyer",
        phone: "5511966660000",
        verified: true,
      });
      try {
        let waiting = 0;
        for (let attempt = 0; attempt < 50 && !waiting; attempt++) {
          waiting = (
            await client.query(
              "SELECT count(*)::int AS total FROM pg_stat_activity WHERE application_name='alc_atendimento' AND wait_event_type='Lock'",
            )
          ).rows[0].total;
          if (!waiting) await new Promise((resolve) => setTimeout(resolve, 10));
        }
        expect(waiting).toBeGreaterThan(0);
      } finally {
        finish();
        await sending;
        await contact;
      }
      expect(
        (await client.query("SELECT customer_phone FROM alc_atendimento.cases"))
          .rows[0].customer_phone,
      ).toBe("5511966660000");
      expect(provider.graph).toHaveBeenCalledOnce();
    });
    it("cancels a queued template when its verified contact changes before submission", async () => {
      const record = await owned();
      await queueTemplate("client", record, profile(A));
      await verifyCustomerContact(manager, {
        caseId: record.caseId,
        name: "Synthetic buyer",
        phone: "5511966660000",
        verified: true,
      });
      await processOutbox();
      expect(provider.graph).not.toHaveBeenCalled();
      expect(
        (await client.query("SELECT status FROM alc_atendimento.outbox"))
          .rows[0].status,
      ).toBe("cancelled");
    });
    it("cancels proactive customer contact after a classification change", async () => {
      const record = await owned();
      await queueTemplate("client", record, profile(A));
      await persistRecord(
        currentRecord({ classification: "aberta", mainStatus: "REVIEW" }),
      );
      await processOutbox();
      expect(provider.graph).not.toHaveBeenCalled();
      expect(
        (await client.query("SELECT status FROM alc_atendimento.outbox"))
          .rows[0].status,
      ).toBe("cancelled");
    });
    it("blocks revoked authors of queued human replies", async () => {
      const record = await owned();
      await queueTemplate("client", record, profile(A));
      await processOutbox();
      provider.graph.mockClear();
      const row = (
        await client.query(
          "UPDATE alc_atendimento.conversations SET status='human',last_inbound_at=now() RETURNING id",
        )
      ).rows[0];
      await mutateConversation(profile(A), {
        id: row.id,
        action: "reply",
        body: "Synthetic reply",
      });
      identities.rows = identities.rows.filter((p) => p.id !== A);
      await processOutbox();
      expect(provider.graph).not.toHaveBeenCalled();
      expect(
        (
          await client.query(
            "SELECT status FROM alc_atendimento.outbox WHERE sender_kind='human'",
          )
        ).rows[0].status,
      ).toBe("cancelled");
    });
    it("keeps read delivery state despite delayed or unknown provider statuses", async () => {
      const record = await owned();
      await queueTemplate("client", record, profile(A));
      await processOutbox();
      for (const status of ["read", "sent", "failed", "delivered", "unknown"]) {
        await client.query(
          "INSERT INTO alc_atendimento.webhook_events(event_key,channel,payload) VALUES($1,'client',$2)",
          [
            status,
            {
              entry: [
                {
                  changes: [
                    {
                      value: {
                        metadata: { phone_number_id: "synthetic-phone" },
                        statuses: [{ id: "synthetic-provider-id", status }],
                      },
                    },
                  ],
                },
              ],
            },
          ],
        );
        await processEvents();
      }
      expect(
        (await client.query("SELECT status FROM alc_atendimento.messages"))
          .rows[0].status,
      ).toBe("read");
      expect(
        (
          await client.query(
            "SELECT status,delivery_status FROM alc_atendimento.outbox",
          )
        ).rows[0],
      ).toEqual({ status: "sent", delivery_status: "read" });
    });
  },
);
