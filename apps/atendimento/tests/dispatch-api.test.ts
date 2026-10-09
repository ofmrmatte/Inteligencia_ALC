import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  profile: vi.fn(),
  scope: vi.fn(),
  query: vi.fn(),
  batch: vi.fn(),
  preview: vi.fn(),
}));
vi.mock("../lib/auth", async (original) => ({
  ...(await original()),
  currentProfile: mocks.profile,
  scopeFor: mocks.scope,
}));
vi.mock("../lib/db", () => ({
  db: () => ({ query: mocks.query }),
  core: vi.fn(),
  setting: vi.fn(),
  audit: vi.fn(),
}));
vi.mock("../lib/dispatch-batches", () => ({
  dispatchBatch: mocks.batch,
  dispatchPreview: mocks.preview,
}));
import { GET, POST } from "../app/api/[resource]/route";
import { HttpError } from "../lib/auth";
const context = (resource: string) => ({
  params: Promise.resolve({ resource }),
});
const request = (body: unknown) =>
  new Request("https://example.test/api/dispatch", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://example.test",
    },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.profile.mockResolvedValue({
    id: "11111111-1111-4111-8111-111111111111",
    role: "developer",
  });
  mocks.scope.mockResolvedValue({
    full: false,
    pairs: new Set(["SP|BASE A"]),
    safe: new Set(),
  });
  mocks.query.mockResolvedValue({ rows: [] });
  mocks.batch.mockResolvedValue({
    batchId: "22222222-2222-4222-8222-222222222222",
    queued: 1,
    results: [{ caseId: "test-case", status: "queued" }],
  });
  mocks.preview.mockResolvedValue({
    records: [],
    competence: "202610Q1",
    limit: 10000,
  });
});
it.each(["driver", "client"])(
  "filtra histórico %s antes do limite com autoria imutável",
  async (channel) => {
    const response = await GET(
      new Request(`https://example.test/api/outbox?channel=${channel}`),
      context("outbox"),
    );
    expect(response.status).toBe(200);
    const [sql, values] = mocks.query.mock.calls[0];
    expect(values).toEqual([["SP|BASE A"], [], channel]);
    expect(sql).toMatch(
      /WHERE[\s\S]*c.base_key[\s\S]*o.channel=\$3[\s\S]*LIMIT 1000/,
    );
    expect(sql).toContain("operator_name_snapshot");
    expect(sql).toContain("dispatch_batch_id");
  },
);
it.each(["outbox", "dispatch-preview"])(
  "rejeita canal inválido em %s",
  async (resource) => {
    const response = await GET(
      new Request(`https://example.test/api/${resource}?channel=email`),
      context(resource),
    );
    expect(response.status).toBe(400);
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.preview).not.toHaveBeenCalled();
  },
);
it.each(["driver", "client"])(
  "prévia %s usa serviço de responsáveis e não enfileira",
  async (channel) => {
    const response = await GET(
      new Request(
        `https://example.test/api/dispatch-preview?channel=${channel}`,
      ),
      context("dispatch-preview"),
    );
    expect(response.status).toBe(200);
    expect(mocks.preview).toHaveBeenCalledWith(await mocks.profile(), channel);
    expect(mocks.batch).not.toHaveBeenCalled();
  },
);
it.each(["driver", "client"])(
  "disparo %s usa lote global para gestor, sem nome genérico",
  async (channel) => {
    const response = await POST(
      request({ caseId: "test-case", channel }),
      context("dispatch"),
    );
    expect(response.status).toBe(200);
    expect(mocks.batch).toHaveBeenCalledWith(await mocks.profile(), {
      batchId: expect.any(String),
      caseIds: ["test-case"],
      channel,
      mode: "global",
    });
  },
);
it("atendente usa modo individual e o serviço valida sua função e PNR", async () => {
  mocks.profile.mockResolvedValue({
    id: "11111111-1111-4111-8111-111111111111",
    role: "supervisor",
  });
  await POST(
    request({ caseId: "test-case", channel: "client" }),
    context("dispatch"),
  );
  expect(mocks.batch).toHaveBeenCalledWith(
    await mocks.profile(),
    expect.objectContaining({ mode: "individual" }),
  );
});
it.each([403, 409, 503])(
  "preserva recusa %i do serviço sem reenviar",
  async (status) => {
    mocks.batch.mockRejectedValue(new HttpError(status, "Bloqueado"));
    const response = await POST(
      request({ caseId: "test-case", channel: "client" }),
      context("dispatch"),
    );
    expect(response.status).toBe(status);
    expect(mocks.batch).toHaveBeenCalledOnce();
  },
);
it("não aceita responsável ou nome injetado pelo cliente", async () => {
  const response = await POST(
    request({
      caseId: "test-case",
      channel: "client",
      assignedTo: "other",
      operatorName: "fake",
    }),
    context("dispatch"),
  );
  expect(response.status).toBe(400);
  expect(mocks.batch).not.toHaveBeenCalled();
});
it("um registro bloqueado não é apresentado como enfileirado", async () => {
  mocks.batch.mockResolvedValue({
    batchId: "test-batch",
    queued: 0,
    results: [
      { caseId: "test-case", status: "blocked", reason: "Sem responsável" },
    ],
  });
  const response = await POST(
    request({ caseId: "test-case", channel: "client" }),
    context("dispatch"),
  );
  expect(response.status).toBe(409);
});
it("preserva atributos legados das automações sem permitir substituir o nome do atendente", async () => {
  const response = await POST(request({ driverNotifications: false, clientOutreach: false, bot: true, operatorName: "Nome legado enviado pela interface antiga", intervalMinutes: 30 }), context("automation"));
  expect(response.status).toBe(200);
  const [sql, parameters] = mocks.query.mock.calls[0];
  expect(sql).toContain("SET value=value || $1::jsonb");
  expect(parameters[0]).toEqual({ driverNotifications: false, clientOutreach: false, bot: true, intervalMinutes: 30 });
  expect(parameters[0]).not.toHaveProperty("operatorName");
  expect(mocks.batch).not.toHaveBeenCalled();
});
