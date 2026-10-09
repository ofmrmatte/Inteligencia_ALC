import { createRoot } from "react-dom/client";
import { WorkspaceShell } from "../../components/workspace-shell";
import { AgentManagement } from "../../components/agent-management";
import { Overview } from "../../components/overview";
import { AutomationForm } from "../../components/administration";
import { AgentPanel } from "../../components/agent-panel";
import {
  CUSTOMER_STEPS,
  DRIVER_STEPS,
  AGENT_GUARDRAILS,
} from "../../lib/agent-playbook";
import { usePathname } from "./platform";
import "../../app/globals.css";
const A = "11111111-1111-4111-8111-111111111111",
  B = "22222222-2222-4222-8222-222222222222";
const now = "2026-10-09T12:00:00.000Z";
const profile = {
  id: A,
  fullName: "Pessoa de revisão",
  email: "review@example.test",
  role: "developer" as const,
  globalAccess: true,
  baseScope: [],
  siglaScope: [],
};
const units = Array.from({ length: 45 }, (_, i) => ({
  unit_key: `test-${i}`,
  sigla: `TEST-${i}`,
  base_key: `BASE ${i}`,
  base_name: `Cidade de revisão ${i}`,
  xpt_code: i % 2 ? "TEST-X" : "",
  coordinator_name: "Gestor de referência",
  supervisors: ["Supervisão de referência"],
}));
const operators = [A, B].map((id, i) => ({
  user_id: id,
  name: `Atendente de revisão ${i + 1}`,
  active: true,
  available: true,
  receiving: true,
  roles: ["agent"],
  identityEnabled: true,
  conversations: 7,
  bases: [{ unit_key: "test-0", responsibility: i ? "substitute" : "primary" }],
}));
let policy = { mode: "manual" },
  assignment = {
    case_id: "TEST-PNR",
    base_key: "BASE 0",
    sigla: "TEST-0",
    classification: "aguardando_comprovante",
    assigned_to: A,
    version: 1,
    reason: "Justificativa de revisão",
    created_at: now,
  };
let config = {
    revision: 0,
    enabled: false,
    provider: "openai",
    model: "gpt-4.1-mini",
    dailyCallLimit: 10,
    timeoutMs: 8000,
  },
  used = 0;
const auditRequests: { path: string; method: string }[] = [];
Object.assign(window, { reviewRequests: auditRequests });
// Browser-only synthetic transport; this fixture never reaches real APIs or providers.
window.fetch = async (input, init) => {
  const url = new URL(String(input), location.origin);
  if (url.origin !== location.origin || !url.pathname.startsWith("/api/"))
    throw new Error("Non-fixture network request refused");
  const path = url.pathname.slice(5),
    body = init?.body ? JSON.parse(String(init.body)) : null;
  auditRequests.push({ path, method: init?.method || "GET" });
  let value: unknown;
  if (path === "operators" && body) {
    const op = operators.find((o) => o.user_id === body.userId)!;
    Object.assign(op, {
      ...body,
      bases: body.bases.map(
        (b: { unitKey: string; responsibility: string }) => ({
          unit_key: b.unitKey,
          responsibility: b.responsibility,
        }),
      ),
    });
    value = { ok: true };
  } else if (path === "operators")
    value = {
      profiles: operators.map((o) => ({
        id: o.user_id,
        name: o.name,
        unitKeys: units.map((u) => u.unit_key),
      })),
      units,
      records: operators,
    };
  else if (path === "coverage") {
    for (const op of operators) {
      op.bases = op.bases.filter((b) => b.unit_key !== body.unitKey);
      const binding = body.assignments.find(
        (a: { userId: string }) => a.userId === op.user_id,
      );
      if (binding)
        op.bases.push({
          unit_key: body.unitKey,
          responsibility: binding.responsibility,
        });
    }
    value = { ok: true };
  } else if (path === "assignment-policy") {
    if (body) policy = body;
    value = { policy };
  } else if (path === "assignments") {
    if (body) {
      assignment = {
        ...assignment,
        assigned_to: body.assignedTo,
        version: assignment.version + 1,
        reason: body.reason,
      };
      value = { ok: true };
    } else
      value = {
        records: [assignment],
        summary: {
          total: 1,
          assigned: 1,
          unassigned: 0,
          recentRedistributions: 2,
        },
      };
  } else if (path === "overview")
    value = {
      open: 12,
      proof: 8,
      penalty: 4,
      human: 7,
      pending: 3,
      unread: 3,
      competence: "202610Q1",
      purchase_value_confirmed: "1200.50",
      penalty_value_confirmed: "400.50",
      proof_value_confirmed: null,
      purchase_value_unknown: 2,
      authorship: { ai: 6, human: 7 },
      source: {
        lastSync: now,
        syncStats: {
          new: 3,
          updated: 7,
          unchanged: 15,
          stale: 2,
          errors: 1,
          classificationChanged: 2,
          verifiedPhoneAdded: 3,
          scopeChanged: 1,
          verifiedContactConflicts: 0,
        },
      },
      collector: { enabled: false, completed: true },
      queue: [],
      conversationsByOperator: operators.map((o) => ({
        assigned_to: o.user_id,
        operator_name: o.name,
        conversations: o.conversations,
      })),
      recentCases: [{ ...assignment, updated_at: now }],
    };
  else if (path === "profile") value = { profile, admin: true };
  else if (path === "automation") value = { ok: true };
  else if (path === "ai-config") {
    if (body) config = { ...body, revision: config.revision + 1 };
    value = {
      config,
      used,
      remaining: 10 - used,
      credentials: {
        openai: { configured: true, source: "environment", stored: false },
        gemini: { configured: false, source: "absent", stored: false },
      },
      diagnostic: { effective: "rules", lastTest: null },
    };
  } else if (path === "ai-models")
    value = {
      models: [
        { id: "gpt-4.1-mini", label: "gpt-4.1-mini" },
        { id: "gpt-4o-mini", label: "gpt-4o-mini" },
      ],
      fetchedAt: now,
    };
  else if (path === "ai-test") {
    used++;
    value = {
      provider: body.provider,
      model: body.model,
      result: "ready",
      testedAt: now,
    };
  } else if (path === "agent-instructions")
    value = {
      revision: 0,
      client: CUSTOMER_STEPS.map((s) => ({ ...s, channel: "client" })),
      driver: DRIVER_STEPS.map((s) => ({ ...s, channel: "driver" })),
      policies: AGENT_GUARDRAILS,
    };
  else
    return Response.json(
      { error: "This local fixture does not implement this operation" },
      { status: 501 },
    );
  return Response.json(value);
};
function Review() {
  const path = usePathname();
  return (
    <WorkspaceShell profile={profile} inteligenciaUrl="https://example.test">
      <p className="notice" style={{ margin: 0 }}>
        Revisão visual local: dados sintéticos, sem chamadas externas.
      </p>
      {path.startsWith("/gestao/") ? (
        <AgentManagement
          key={path}
          section={
            path.endsWith("bases")
              ? "bases"
              : path.endsWith("filas")
                ? "queue"
                : "operators"
          }
        />
      ) : path === "/visao-geral" ? (
        <Overview />
      ) : (
        <main className="page">
          {location.search.includes("ai") ? (
            <AgentPanel />
          ) : (
            <AutomationForm
              initial={{
                driverNotifications: false,
                clientOutreach: false,
                bot: true,
                intervalMinutes: 30,
                operatorName: "Valor legado",
              }}
              refresh={async () => {}}
            />
          )}
        </main>
      )}
    </WorkspaceShell>
  );
}
createRoot(document.getElementById("root")!).render(<Review />);
