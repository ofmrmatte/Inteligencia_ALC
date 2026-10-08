import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import {
  classification,
  competence,
  clientReply,
  clientOpening,
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
  entryReceipt,
  validEntryReceipt,
  ENTRY_SECONDS,
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
    expect(done.state.step).toBe("done");
    expect(done.reply).toContain("encerre a reclamação");
    expect(done.reply).toContain("aplicativo do Mercado Livre");
    expect(done.reply).not.toMatch(/conseguiu encerrar|responda quando encerrar|confirme o encerramento/i);
  });
  it("não considera verificar com a portaria como confirmação de recebimento ou negativa", () => {
    const reply = clientReply({ step: "receipt" }, "Não recebi");
    expect(reply.state.step).toBe("neighbors");
    expect(
      clientReply(reply.state, "Sim, verifiquei").state.result,
    ).toBeUndefined();
    const denied = clientReply(reply.state, "Não localizei o produto");
    expect(denied.state.result).toBe("nao_recebido");
    expect(denied.state.step).toBe("human");
    expect(denied.handoff).toBe(true);
    expect(denied.reply).toContain("Prevenção de Perdas");
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
      purchaseValue: 199.9,
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
      "purchase_value",
    ]);
    expect(result[0].parameters.find(p => p.parameter_name === "purchase_value")?.text).toBe("R$ 199,90");
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
  it("aceita a entrada pelo painel somente com a mesma identidade e sessão Supabase", () => {
    const key = "c".repeat(64),
      now = 1000;
    const receipt = entryReceipt("profile-a", "session-a", key, now);
    expect(
      validEntryReceipt(
        receipt,
        key,
        { sub: "profile-a", session_id: "session-a" },
        now,
      ),
    ).toBe(true);
    expect(receipt).not.toContain("access_token");
    expect(receipt).not.toContain("refresh_token");
  });
  it("uma entrada do painel não autoriza outro usuário ou outra sessão", () => {
    const key = "c".repeat(64),
      now = 1000;
    const receipt = entryReceipt("profile-a", "session-a", key, now);
    expect(
      validEntryReceipt(
        receipt,
        key,
        { sub: "profile-b", session_id: "session-a" },
        now,
      ),
    ).toBe(false);
    expect(
      validEntryReceipt(
        receipt,
        key,
        { sub: "profile-a", session_id: "session-b" },
        now,
      ),
    ).toBe(false);
    expect(validEntryReceipt(receipt, key, { sub: "profile-a" }, now)).toBe(
      false,
    );
  });
  it("rejeita entrada ausente ou adulterada mesmo com uma identidade Supabase válida", () => {
    const key = "c".repeat(64),
      now = 1000,
      claims = { sub: "profile-a", session_id: "session-a" };
    const receipt = entryReceipt(claims.sub, claims.session_id, key, now);
    expect(validEntryReceipt(undefined, key, claims, now)).toBe(false);
    expect(validEntryReceipt("x" + receipt, key, claims, now)).toBe(false);
    expect(validEntryReceipt(receipt, "d".repeat(64), claims, now)).toBe(false);
    expect(validEntryReceipt(receipt, key, {}, now)).toBe(false);
  });
  it("exige uma nova entrada pelo painel depois do prazo e falha sem configuração", () => {
    const key = "c".repeat(64),
      now = 1000,
      claims = { sub: "profile-a", session_id: "session-a" };
    const receipt = entryReceipt(claims.sub, claims.session_id, key, now);
    expect(
      validEntryReceipt(receipt, key, claims, now + ENTRY_SECONDS * 1000 - 1),
    ).toBe(true);
    expect(
      validEntryReceipt(receipt, key, claims, now + ENTRY_SECONDS * 1000),
    ).toBe(false);
    expect(validEntryReceipt(receipt, "", claims, now)).toBe(false);
    expect(() => entryReceipt("", claims.session_id, key, now)).toThrow();
  });
});
