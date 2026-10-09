import { expect, it } from "vitest";
import { agentAiPlan, clientReply, validateAgentAiAction, type AgentState } from "../lib/domain";
import { effectiveInstructions, instructionSnapshotFor, scriptSnapshotFor } from "../lib/agent-instructions";
import { DRIVER_STEPS } from "../lib/agent-playbook";

it.each([
  ["receipt", "Está comigo", "yes", "date"], ["receipt", "Até agora nada aqui", "no", "neighbors"],
  ["receipt", "Preciso conferir melhor", "uncertain", "uncertain"], ["neighbors", "Ainda vou olhar", "checking", "neighbors_wait"],
  ["neighbors_wait", "O pacote apareceu", "yes", "date"], ["product", "Tudo de acordo com a compra", "yes", "done"],
  ["product", "Mandaram outra coisa", "no", "human"], ["neighbors", "Não apareceu por aqui", "no", "human"],
])("validates %s / %s independently with canonical intent %s", (step, text, action, next) => {
  const state = { step }, baseline = clientReply(state, text);
  expect(agentAiPlan("client", state, text, baseline, true).actions).toContain(action);
  expect(validateAgentAiAction(action, "client", state, text, baseline, true)?.state.step).toBe(next);
  expect(validateAgentAiAction("change_official_status", "client", state, text, baseline, true)).toBeNull();
});
it.each([
  [{ step: "product", receivedAt: "07/10" }, "Sim"], [{ step: "receipt" }, "Não quero contato"],
  [{ step: "done" }, "Sim"], [{ step: "human" }, "Sim"],
])("protects done, opt-out and handoff %s", (state, text) => {
  const baseline = clientReply(state as AgentState, text);
  expect(agentAiPlan("client", state as AgentState, text, baseline, true).reason).toBe("rules_terminal");
  expect(validateAgentAiAction("continue_product", "client", state as AgentState, text, baseline, true)).toBeNull();
});
it("rejects a forged baseline without overwriting a transition decided by original rules", () => {
  const state = { step: "receipt" }, baseline = clientReply(state, "Algo ambíguo");
  expect(validateAgentAiAction("yes", "client", state, "Talvez", baseline, true)).toBeNull();
});
it.each(["date", "found_later", "third_party"])("does not let AI invent a date or assert third-party authorization in %s", step => {
  const state = { step }, text = "Tudo certo", baseline = clientReply(state, text);
  expect(validateAgentAiAction("yes", "client", state, text, baseline, true)).toBeNull();
  expect(validateAgentAiAction("continue_product", "client", state, text, baseline, true)).toBeNull();
});
it("excludes driver identity/status lookups and preserves manual M11 without M12", () => {
  const state = { step: "driver_continue" }, baseline = { state, reply: "Acareação manual entregue ao dispatcher." };
  expect(agentAiPlan("driver", state, "Tenho comprovante", baseline, false).reason).toBe("identity_unverified");
  expect(agentAiPlan("driver", { step: "driver_name" }, "Nome Pessoa", baseline, true).reason).toBe("unsupported_state");
  expect(agentAiPlan("driver", state, "PNR encerrada", baseline, true).reason).toBe("unsupported_state");
  expect(agentAiPlan("driver", state, "Tenho comprovante", baseline, true)).toMatchObject({ actions: ["manual_evidence"], code: "M11" });
  expect(DRIVER_STEPS.find(step => step.code === "M11")?.example).toContain("manual");
  expect(DRIVER_STEPS.some(step => step.code === "M12")).toBe(false);
});
it("copies immutable treatment snapshots while preserving legacy settings and policies", () => {
  const current = effectiveInstructions({ revision: 3, scripts: {}, policies: ["Encaminhar divergências ao humano."] });
  const snapshot = instructionSnapshotFor("driver", current);
  current.policies?.push("Outra política válida.");
  expect(snapshot.policies).toEqual(["Encaminhar divergências ao humano."]);
  expect(snapshot.revision).toBe(3);
  expect(snapshot.playbookVersion).toBeTruthy();
  expect(snapshot.mandatoryPolicies.length).toBeGreaterThan(0);
  expect(snapshot.scripts).toHaveLength(14);
  expect(() => scriptSnapshotFor("driver", "M12", current)).toThrow(/inexistente/);
});
