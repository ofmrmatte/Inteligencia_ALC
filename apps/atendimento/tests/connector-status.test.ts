import { describe, expect, it } from "vitest";
import { connectorStatus } from "../lib/connector-status";

describe("detecção da extensão ALC PNR Connector", () => {
  it("não confunde um painel ainda não verificado com extensão ausente", () => {
    expect(connectorStatus(null, "1.2.1", false).kind).toBe("checking");
  });

  it("reconhece a versão correta fornecida pelo próprio navegador", () => {
    expect(connectorStatus({ installed: true, version: "1.2.1", mlTabAvailable: true }, "1.2.1", true))
      .toMatchObject({ kind: "ready", ready: true });
  });

  it("diferencia uma instalação antiga e impede a coleta por ela", () => {
    const status = connectorStatus({ installed: true, version: "1.2.0" }, "1.2.1", true);
    expect(status.kind).toBe("version-mismatch");
    expect(status.ready).toBe(false);
    expect(status.label).toContain("1.2.0");
    expect(status.label).toContain("1.2.1");
  });

  it("não afirma que a extensão não foi instalada quando apenas não respondeu", () => {
    const status = connectorStatus(null, "1.2.1", true);
    expect(status.kind).toBe("unreachable");
    expect(status.ready).toBe(false);
    expect(status.label).toContain("pode estar instalada");
  });
});
