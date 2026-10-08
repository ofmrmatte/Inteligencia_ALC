import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import {
  classification,
  competence,
  clientReply,
  templateParameters,
  phone,
  type CaseRecord,
} from "../lib/domain";
import { validSignature } from "../lib/meta";
import { visible } from "../lib/auth";
import {
  sealSession,
  openSession,
  newTicket,
  ticketHash,
} from "@alc/identity/transfer";
describe("regras operacionais do Atendimento", () => {
  it("classifica os códigos reais do Case Center e preserva encerramento", () => {
    expect(classification("NEW", "WAITING_RECEIPT")).toBe(
      "aguardando_comprovante",
    );
    expect(classification("NEW", "TO_BILL")).toBe("penalidade");
    expect(classification("CLOSED", "BILLED")).toBe("encerrada");
    expect(classification("IN_PROGRESS", "ON_REVIEW")).toBe("aberta");
  });
  it("respeita a virada da quinzena em São Paulo", () => {
    expect(competence(new Date("2026-10-16T02:59:00Z"))).toBe("202610Q1");
    expect(competence(new Date("2026-10-16T03:00:00Z"))).toBe("202610Q2");
  });
  it("registra recebimento somente depois de data e produto corretos", () => {
    const receipt = clientReply({ step: "receipt" }, "Sim, recebi");
    expect(receipt.state.step).toBe("date");
    expect(clientReply(receipt.state, "31/02").state.step).toBe("date");
    const date = clientReply(receipt.state, "08/10");
    expect(date.state.step).toBe("product");
    const done = clientReply(date.state, "Sim, correto");
    expect(done.state).toMatchObject({
      result: "recebimento_confirmado",
      receivedAt: "08/10",
      correctProduct: true,
    });
    expect(done.reply).toContain("aplicativo do Mercado Livre");
  });
  it("não considera verificar com a portaria como confirmação de recebimento ou negativa", () => {
    const reply = clientReply({ step: "receipt" }, "Não recebi");
    expect(reply.state.step).toBe("neighbors");
    expect(
      clientReply(reply.state, "Sim, verifiquei").state.result,
    ).toBeUndefined();
    const denied = clientReply(reply.state, "Não localizei o produto");
    expect(denied.state.result).toBe("nao_recebido");
    expect(denied.reply).toContain("encaminharemos");
  });
  it("encaminha divergência e pedidos de equipe sem insistir com o robô", () => {
    expect(
      clientReply({ step: "product" }, "O produto está errado").handoff,
    ).toBe(true);
    expect(
      clientReply({ step: "date" }, "Quero falar com atendente").handoff,
    ).toBe(true);
  });
  it("rejeita telefone inválido e mantém número brasileiro canônico", () => {
    expect(phone("(11) 99999-0000")).toBe("5511999990000");
    expect(phone("123")).toBe("");
  });
  it("não envia modelo de cliente usando contato parcial ou detalhes incompletos", () => {
    const r = {
      driverName: "Motorista de teste",
      customerVerified: false,
      customerName: "Cliente de teste",
      customerPhone: "5511999990000",
      products: [{ title: "Produto de teste" }],
      deliveryAt: "2026-10-08T13:00:00Z",
      shipmentId: "TEST-SHIPMENT",
    } as CaseRecord;
    expect(() => templateParameters("client", r, "Equipe Loss")).toThrow(
      "incompletos",
    );
    const result = templateParameters(
      "client",
      { ...r, customerVerified: true },
      "Equipe Loss",
    );
    expect(result[0].parameters.map((p) => p.parameter_name)).toEqual([
      "customer_name",
      "nome_disparou",
      "product_name",
      "delivery_date",
      "delivery_time",
      "product_id",
    ]);
    expect(templateParameters("driver", r, "Equipe Loss")).toHaveLength(2);
  });
  it("não amplia o acesso de bases com a mesma sigla", () => {
    const scope = {
      full: false,
      pairs: new Set(["SP|BASE A"]),
      safe: new Set<string>(),
    };
    expect(visible(scope, { sigla: "SP", base_key: "BASE A" })).toBe(true);
    expect(visible(scope, { sigla: "SP", base_key: "BASE B" })).toBe(false);
    expect(visible(scope, { sigla: "SP", base_key: "SP" })).toBe(false);
    expect(visible(scope, { base_key: "" })).toBe(false);
  });
  it("rejeita assinatura ausente, incorreta e payload modificado", () => {
    const raw = '{"object":"whatsapp_business_account"}',
      secret = "synthetic-test-secret";
    const signature =
      "sha256=" + createHmac("sha256", secret).update(raw).digest("hex");
    expect(validSignature(raw, signature, secret)).toBe(true);
    expect(validSignature(raw + " ", signature, secret)).toBe(false);
    expect(validSignature(raw, null, secret)).toBe(false);
    expect(validSignature(raw, signature, "")).toBe(false);
  });
  it("protege a sessão no acesso entre aplicações e detecta adulteração", () => {
    const key = "a".repeat(64),
      session = {
        access_token: "synthetic-access",
        refresh_token: "synthetic-refresh",
      };
    const sealed = sealSession(session, key);
    expect(sealed).not.toContain("synthetic");
    expect(openSession(sealed, key)).toEqual(session);
    expect(() => openSession(sealed, "b".repeat(64))).toThrow();
    expect(() => sealSession(session, "bad")).toThrow();
    const ticket = newTicket();
    expect(ticket).toMatch(/^[a-f0-9]{64}$/);
    expect(ticketHash(ticket)).not.toBe(ticket);
  });
});
