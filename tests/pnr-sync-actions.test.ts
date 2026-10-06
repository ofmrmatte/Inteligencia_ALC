import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("PNR sync actions", () => {
  const view = readFileSync("components/views/pnr-inbox-view.tsx", "utf8");

  it("lê a competência selecionada diretamente no Case Center", () => {
    expect(view).toContain('"READ_CASE_CENTER_PERIOD"');
    expect(view).toContain("const competence = await readCaseCenterCompetence()");
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

  it("mantém a competência do Case Center fixa durante a captura iniciada", () => {
    expect(view).toContain('requestPnrConnector<CaseCenterPage>("FETCH_PAGE", { competence, page })');
    expect(view).toContain("activeResumeKey = resumeKeyFor(competence)");
  });

  it("exibe ação explícita de retomada quando existe captura pausada", () => {
    expect(view).toContain('"Continuar importação"');
    expect(view).toContain('resumeAvailable ? <Play size={17} />');
    expect(view).toContain("resumeKeyFor(selected)");
    expect(view).toContain("Pronta para continuar da página");
  });

  it("reconfere a competência ao voltar do Case Center", () => {
    expect(view).toContain('window.addEventListener("focus", refreshResumeState)');
  });

});
