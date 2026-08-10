import test from "node:test";
import assert from "node:assert/strict";
import { buildOperationalAlerts } from "@/features/operational-alerts/domain";

test("gera alerta para PNR aguardando comprovante", () => {
  const alerts = buildOperationalAlerts({
    pnrAwaitingProof: 3,
    missingExpired: 0,
    missingNearDeadline: 0,
    missingPending: 0,
    processingIssues: 0,
    includeAdmin: false,
  });
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].href, "/desvios-pnr?status=Aguardando+Comprovante");
  assert.equal(alerts[0].severity, "attention");
});

test("pacote faltante vencido tem prioridade critica", () => {
  const alerts = buildOperationalAlerts({
    pnrAwaitingProof: 2,
    missingExpired: 1,
    missingNearDeadline: 4,
    missingPending: 0,
    processingIssues: 0,
    includeAdmin: false,
  });
  assert.equal(alerts[0].id, "pacotes-faltantes-expired");
  assert.equal(alerts[0].severity, "critical");
});

test("situacao resolvida sem contagens nao gera alerta", () => {
  const alerts = buildOperationalAlerts({
    pnrAwaitingProof: 0,
    missingExpired: 0,
    missingNearDeadline: 0,
    missingPending: 0,
    processingIssues: 0,
    includeAdmin: true,
  });
  assert.equal(alerts.length, 0);
});

test("alerta administrativo exige perfil admin", () => {
  const commonUserAlerts = buildOperationalAlerts({
    pnrAwaitingProof: 0,
    missingExpired: 0,
    missingNearDeadline: 0,
    missingPending: 0,
    processingIssues: 2,
    includeAdmin: false,
  });
  const adminAlerts = buildOperationalAlerts({
    pnrAwaitingProof: 0,
    missingExpired: 0,
    missingNearDeadline: 0,
    missingPending: 0,
    processingIssues: 2,
    includeAdmin: true,
  });

  assert.equal(commonUserAlerts.length, 0);
  assert.equal(adminAlerts.length, 1);
  assert.equal(adminAlerts[0].module, "processamento");
});
