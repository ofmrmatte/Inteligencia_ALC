import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("PNR sync actions", () => {
  const view = readFileSync("components/views/pnr-inbox-view.tsx", "utf8");

  it("usa a competência atual automaticamente", () => {
    expect(view).toContain("const competence =");
    expect(view).not.toContain("captureYear");
    expect(view).not.toContain("captureMonth");
    expect(view).not.toContain("captureHalf");
  });

  it("mantém somente as duas ações principais da captura", () => {
    expect(view).toContain("Abrir Case Center");
    expect(view).toContain("Trazer Dados para Inteligência ALC");
    expect(view).not.toContain("<span>Ano</span>");
    expect(view).not.toContain("<span>Mês</span>");
    expect(view).not.toContain("<span>Quinzena</span>");
  });
  it("abre o Case Center sem enviar competência ou aplicar filtro", () => {
    expect(view).toContain('const CASE_CENTER_URL = "https://envios.adminml.com/logistics/case-center/cases"');
    expect(view).toContain('window.open(CASE_CENTER_URL, "_blank")');
    expect(view).not.toContain('requestPnrConnector("OPEN_CASE_CENTER"');
  });

});
