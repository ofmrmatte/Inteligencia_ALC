import { describe, expect, it } from "vitest";
import connectorManifest from "alc-pnr-connector/src/manifest.json";
import {
  connectorStateFromHandshake,
  compareConnectorVersions,
  LATEST_CONNECTOR_VERSION,
  MINIMUM_SUPPORTED_CONNECTOR_VERSION,
} from "@/lib/pnr-connector-client";

describe("distribuição do Conector PNR", () => {
  it("compara versões numericamente", () => {
    expect(compareConnectorVersions("1.0.9", "1.0.10")).toBeLessThan(0);
    expect(compareConnectorVersions("1.0.0", "1.0.0")).toBe(0);
    expect(compareConnectorVersions("1.2.0", "1.1.9")).toBeGreaterThan(0);
    expect(() => compareConnectorVersions("99999999999999999999.0.0", "1.0.0")).toThrow();
  });

  it("separa ausência da extensão, aba e sessão", () => {
    expect(connectorStateFromHandshake(null)).toBe("extension-missing");
    expect(connectorStateFromHandshake({ installed: true, version: "1.1.17", mlTabAvailable: false, sessionAvailable: false })).toBe("ml-missing");
    expect(connectorStateFromHandshake({ installed: true, version: "1.1.17", mlTabAvailable: true, sessionAvailable: false })).toBe("expired");
    expect(connectorStateFromHandshake({ installed: true, version: "1.1.17", mlTabAvailable: true, sessionAvailable: false, sessionError: "INVALID_RESPONSE" })).toBe("error");
    expect(connectorStateFromHandshake({ installed: true, version: "1.1.10", mlTabAvailable: true, sessionAvailable: true })).toBe("unsupported");
    expect(connectorStateFromHandshake({ installed: true, version: LATEST_CONNECTOR_VERSION, mlTabAvailable: true, sessionAvailable: true })).toBe("connected");
  });

  it("bloqueia versões anteriores ao mínimo e avisa quando há uma versão mais recente", () => {
    const ready = { installed: true as const, version: "1.1.7", mlTabAvailable: true, sessionAvailable: true };
    expect(connectorStateFromHandshake({ ...ready, version: "1.0.0" })).toBe("unsupported");
    expect(connectorStateFromHandshake({ ...ready, version: "1.1.8" }, { minimumSupportedVersion: "1.1.0", latestVersion: "1.2.0" })).toBe("outdated");
    expect(connectorStateFromHandshake({ ...ready, version: "invalid" })).toBe("unsupported");
    expect(connectorStateFromHandshake({ ...ready, version: "99999999999999999999.0.0" })).toBe("unsupported");
    expect(LATEST_CONNECTOR_VERSION).toBe("1.2.7");
    expect(MINIMUM_SUPPORTED_CONNECTOR_VERSION).toBe("1.1.17");
  });

  it("restringe a distribuição à produção Railway e ao Case Center", () => {
    expect(connectorManifest.host_permissions).toEqual([
      "https://envios.adminml.com/*",
      "https://inteligenciaalc-production.up.railway.app/*",
      "https://alc-atendimento-production.up.railway.app/*",
    ]);
    expect(connectorManifest.content_scripts).toEqual([
      expect.objectContaining({
        matches: ["https://inteligenciaalc-production.up.railway.app/*", "https://alc-atendimento-production.up.railway.app/*"],
        js: ["panel-bridge.js"],
      }),
    ]);
    expect(JSON.stringify(connectorManifest)).not.toContain("vercel.app");
    expect(JSON.stringify(connectorManifest)).not.toContain("localhost");
  });
});
