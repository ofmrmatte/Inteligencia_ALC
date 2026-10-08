import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  profile: vi.fn(),
  scope: vi.fn(),
  query: vi.fn(),
  queue: vi.fn(),
  config: vi.fn(),
  setting: vi.fn(),
  audit: vi.fn(),
}));
vi.mock("../lib/auth", async (original) => ({
  ...(await original()),
  currentProfile: mocks.profile,
  scopeFor: mocks.scope,
}));
vi.mock("../lib/db", () => ({
  db: () => ({ query: mocks.query }),
  core: vi.fn(),
  setting: mocks.setting,
  audit: mocks.audit,
}));
vi.mock("../lib/source", () => ({
  queueTemplate: mocks.queue,
  syncCore: vi.fn(),
  upsertCases: vi.fn(),
}));
vi.mock("../lib/meta", () => ({
  channelConfig: mocks.config,
  templates: vi.fn(),
  encrypt: vi.fn(),
  graph: vi.fn(),
}));
import { GET, POST } from "../app/api/[resource]/route";
const context = (resource: string) => ({
  params: Promise.resolve({ resource }),
});
const post = (body: unknown) =>
  new Request("https://atendimento.test/api/dispatch", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://atendimento.test",
    },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.profile.mockResolvedValue({
    id: "test-user",
    role: "developer",
    atendimentoAccess: true,
  });
  mocks.scope.mockResolvedValue({
    full: false,
    pairs: new Set(["SP|BASE A"]),
    safe: new Set(),
  });
  mocks.query.mockResolvedValue({
    rows: [
      { base_key: "BASE A", sigla: "SP", record: { caseId: "test-case" } },
    ],
  });
  mocks.config.mockResolvedValue({ appSecret: "synthetic-secret" });
  mocks.setting.mockResolvedValue({ operatorName: "Synthetic operator" });
  mocks.queue.mockResolvedValue(true);
});
it.each(["driver", "client"])(
  "filtra o histórico %s no SQL antes do limite e aplica escopo",
  async (channel) => {
    const response = await GET(
      new Request(`https://atendimento.test/api/outbox?channel=${channel}`),
      context("outbox"),
    );
    expect(response.status).toBe(200);
    const [sql, values] = mocks.query.mock.calls[0];
    expect(values).toEqual([["SP|BASE A"], [], channel]);
    expect(sql).toMatch(
      /WHERE[\s\S]*c.base_key[\s\S]*o.channel=\$3[\s\S]*LIMIT 1000/,
    );
  },
);
it.each(["outbox", "dispatch-preview"])(
  "rejeita canal inválido em %s sem consultar dados",
  async (resource) => {
    const response = await GET(
      new Request(`https://atendimento.test/api/${resource}?channel=email`),
      context(resource),
    );
    expect(response.status).toBe(400);
    expect(mocks.query).not.toHaveBeenCalled();
  },
);
it.each(["driver", "client"])(
  "a prévia %s usa chave inicial da fila e escopo sem enviar",
  async (channel) => {
    const response = await GET(
      new Request(
        `https://atendimento.test/api/dispatch-preview?channel=${channel}`,
      ),
      context("dispatch-preview"),
    );
    expect(response.status).toBe(200);
    const [sql, values] = mocks.query.mock.calls[0];
    expect(sql).toContain("o.dedupe_key=$3||':'||c.case_id");
    expect(sql).toContain(
      "c.driver_phone ELSE c.customer_phone END||':initial'",
    );
    expect(sql).toContain("c.base_key");
    expect(values).toEqual([["SP|BASE A"], [], channel]);
    expect(mocks.queue).not.toHaveBeenCalled();
  },
);
it.each(["driver", "client"])(
  "o envio %s reaproveita a fila e auditoria existentes",
  async (channel) => {
    const response = await POST(
      post({ caseId: "test-case", channel }),
      context("dispatch"),
    );
    expect(response.status).toBe(200);
    expect(mocks.queue).toHaveBeenCalledWith(
      channel,
      { caseId: "test-case" },
      "Synthetic operator",
    );
    expect(mocks.audit).toHaveBeenCalledWith(
      "test-user",
      "manual_template_dispatch",
      "test-case",
      { channel, queued: true },
    );
  },
);
it("não permite disparo de PNR fora do escopo", async () => {
  mocks.query.mockResolvedValue({
    rows: [{ base_key: "BASE B", sigla: "SP", record: {} }],
  });
  const response = await POST(
    post({ caseId: "other-case", channel: "driver" }),
    context("dispatch"),
  );
  expect(response.status).toBe(404);
  expect(mocks.queue).not.toHaveBeenCalled();
});
it("não permite envio por perfil sem administração", async () => {
  mocks.profile.mockResolvedValue({ id: "test-user", role: "supervisor" });
  const response = await POST(
    post({ caseId: "test-case", channel: "client" }),
    context("dispatch"),
  );
  expect(response.status).toBe(403);
  expect(mocks.queue).not.toHaveBeenCalled();
});
it("continua bloqueando o canal sem assinatura configurada", async () => {
  mocks.config.mockResolvedValue({ appSecret: "" });
  const response = await POST(
    post({ caseId: "test-case", channel: "client" }),
    context("dispatch"),
  );
  expect(response.status).toBe(409);
  expect(mocks.queue).not.toHaveBeenCalled();
});
