import { describe, it, expect } from "vitest";
import { CUSTOMER_STEPS, DRIVER_STEPS, fillScript, scriptText } from "../lib/agent-playbook";
import { clientReply } from "../lib/domain";

describe("roteiro integral homologável", () => {
  it("includes every customer C01-C15 and every driver M01-M15 except M12", () => {
    expect(CUSTOMER_STEPS.map(step => step.code)).toEqual(
      Array.from({ length: 15 }, (_, index) => "C" + String(index + 1).padStart(2, "0")),
    );
    expect(DRIVER_STEPS.map(step => step.code)).toEqual(
      Array.from({ length: 15 }, (_, index) => "M" + String(index + 1).padStart(2, "0")).filter(code => code !== "M12"),
    );
    expect(CUSTOMER_STEPS.every(step => step.example.trim() && step.goal.trim())).toBe(true);
    expect(DRIVER_STEPS.every(step => step.example.trim() && step.goal.trim())).toBe(true);
    expect(scriptText("driver","M12")).toBe("");
    expect(DRIVER_STEPS.some(step => /Tony/.test(step.example))).toBe(false);
  });
  it("C04 is terminal; C05 waits freely; C06 can wait for later reply; C07 delegates to Loss", () => {
    const negative = clientReply({ step: "receipt" }, "Não recebi", "Cliente Teste");
    expect(negative).toMatchObject({ state: { step: "neighbors" } });
    expect(negative.reply).toContain("Você chegou a verificar");
    expect(negative.reply).not.toMatch(/Opções:|1\.\s/);
    const waiting = clientReply(negative.state, "Ainda não verifiquei", "Cliente Teste");
    expect(waiting.state.step).toBe("neighbors_wait");
    expect(waiting.reply).toContain("Quando concluir a verificação");
    const stillWaiting = clientReply(waiting.state, "OK", "Cliente Teste");
    expect(stillWaiting.reply).toBe("");
    const notFound = clientReply(waiting.state, "Verifiquei e não encontrei", "Cliente Teste");
    expect(notFound).toMatchObject({ state: { step: "human", result: "nao_recebido" }, handoff: true });
    expect(notFound.reply).toContain("Prevenção de Perdas");
    const received = clientReply({ step: "receipt" }, "Sim, recebi", "Cliente Teste");
    const date = clientReply(received.state, "07/10", "Cliente Teste");
    const done = clientReply(date.state, "Sim, está correto", "Cliente Teste");
    expect(done.state).toMatchObject({ step: "done", result: "recebimento_confirmado" });
    expect(done.reply).toContain("encerre a reclamação");
    expect(clientReply(done.state, "Já encerrei").reply).toBe("");
  });
  it("C08 third party requires authorization before moving to product confirmation", () => {
    const thirdParty = clientReply({step:"receipt"},"O porteiro recebeu","Cliente Teste");
    expect(thirdParty.state.step).toBe("third_party");
    expect(thirdParty.reply).toContain("estava autorizada");
    const unauthorized = clientReply(thirdParty.state,"Não estava autorizado");
    expect(unauthorized.handoff).toBe(true);
    expect(unauthorized.state.step).toBe("human");
    const authorized = clientReply(thirdParty.state,"Sim, autorizado");
    expect(authorized.state.step).toBe("date");
  });
  it("C10 for uncertain delivery does not invent an ID; C11 handles later recovery", () => {
    const unclear = clientReply({step:"receipt"},"Não lembro");
    expect(unclear.state.step).toBe("uncertain");
    expect(unclear.reply).not.toContain("[ID]");
    const found = clientReply({step:"neighbors"},"Encontrei a encomenda");
    expect(found.state.step).toBe("date");
    expect(found.reply).toContain("localizar a encomenda");
  });
  it("C09 transfers product discrepancies; C12 informs without closing; C13 never collects passwords", () => {
    const diverged = clientReply({step:"product",receivedAt:"07/10"},"Produto diferente");
    expect(diverged).toMatchObject({state:{step:"human"},handoff:true});
    const complaint = clientReply({step:"receipt"},"Devo encerrar a reclamação?");
    expect(complaint.state.step).toBe("receipt");
    expect(complaint.reply).toContain("deve refletir o que realmente aconteceu");
    const card = clientReply({step:"receipt"},"Como ativar cartão?");
    expect(card.reply).toContain("Não precisamos que você informe senhas");
    const human = clientReply({step:"date"},"Quero falar com atendente");
    expect(human.handoff).toBe(true);
    expect(scriptText("client","C15")).toContain("ALC & Pereira Filho");
    expect(scriptText("client","C04")).not.toEqual(scriptText("client","C15"));
  });
  it("driver M11 requires manual acareação and dispatcher and M08 is not mapped to penalties", () => {
    expect(scriptText("driver","M11")).toContain("acareação manual");
    expect(scriptText("driver","M11")).toContain("dispatcher");
    expect(scriptText("driver","M08")).toContain("ainda não está vinculada");
    const text = fillScript(scriptText("driver","M11"),{
      "Nome do Motorista":"Motorista Teste", ID:"ENV-001",Caso:"CASO-001",Base:"BASE A",
    });
    expect(text).toContain("ENV-001");
    expect(text).toContain("CASO-001");
    expect(text).not.toMatch(/\[[^\]]+\]/);
  });
});
