// Invoke with an existing Playwright page; every operation stays in the local fixture.
export async function check(page, evidence) {
  const assert = (condition, message = "Visual review assertion failed") => {
    if (!condition) throw new Error(message);
  };
  const results = [],
    errors = [];
  const onError = (error) => errors.push(error.message);
  page.on("pageerror", onError);
  async function ready() {
    await page.evaluate(() =>
      Promise.all([
        document.fonts.ready,
        new Promise((done) =>
          requestAnimationFrame(() => requestAnimationFrame(done)),
        ),
      ]),
    );
  }
  async function layout(name, width) {
    await ready();
    const dimensions = await page.evaluate(() => {
      const dialog = document
        .querySelector("dialog[open]")
        ?.getBoundingClientRect();
      const bad = [
        ...document.querySelectorAll(
          "main button,main input,main select,dialog button,dialog input,dialog select",
        ),
      ]
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          return (
            rect.width &&
            !element.closest(".table-wrap") &&
            (rect.left < -1 || rect.right > innerWidth + 1)
          );
        })
        .map(
          (element) =>
            element.getAttribute("aria-label") || element.textContent,
        );
      return {
        client: document.documentElement.clientWidth,
        scroll: document.documentElement.scrollWidth,
        bad,
        dialogFits:
          !dialog ||
          (dialog.left >= 0 &&
            dialog.right <= innerWidth &&
            dialog.top >= 0 &&
            dialog.bottom <= innerHeight),
      };
    });
    assert(
      dimensions.scroll <= dimensions.client + 1,
      `${name} ${width}: horizontal overflow ${JSON.stringify(dimensions)}`,
    );
    assert(dimensions.bad.length === 0, `${name} ${width}: clipped controls`);
    assert(dimensions.dialogFits, `${name} ${width}: dialog outside viewport`);
    results.push({ view: name, width, ...dimensions });
    if (width === 1440 || width === 390)
      await page.screenshot({
        path: `${evidence}/${name}-${width}.png`,
        scale: "css",
      });
  }
  try {
    for (const width of [1440, 1024, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("http://127.0.0.1:3042/gestao/atendentes");
      await page
        .getByRole("button", { name: "Adicionar atendente", exact: true })
        .waitFor();
      await page
        .getByRole("button", {
          name: "Editar Atendente de revisão 1",
          exact: true,
        })
        .waitFor();
      await layout("atendentes", width);
      await page
        .getByRole("button", { name: "Adicionar atendente", exact: true })
        .click();
      await page
        .getByLabel("Usuário existente")
        .selectOption("11111111-1111-4111-8111-111111111111");
      await page.getByLabel("Buscar bases autorizadas").fill("TEST-44");
      await page
        .getByRole("button", { name: "Selecionar filtradas", exact: true })
        .click();
      assert(
        (await page.locator("dialog").innerText()).includes("1 selecionadas"),
      );
      await layout("atendente-modal", width);
      await page
        .getByRole("button", { name: "Salvar atendente", exact: true })
        .click();
      await page.locator("dialog").waitFor({ state: "detached" });
      assert(
        await page
          .getByRole("button", { name: "Adicionar atendente", exact: true })
          .evaluate((element) => document.activeElement === element),
      );
      await page.goto("http://127.0.0.1:3042/gestao/bases");
      await page
        .getByRole("button", {
          name: "Configurar cobertura TEST-0 Cidade de revisão 0",
          exact: true,
        })
        .waitFor();
      await layout("bases", width);
      await page
        .getByRole("button", { name: "Próxima página", exact: true })
        .click();
      assert((await page.locator("main").innerText()).includes("31–45 de 45"));
      await page
        .getByRole("button", { name: "Página anterior", exact: true })
        .click();
      await page
        .getByRole("button", {
          name: "Configurar cobertura TEST-0 Cidade de revisão 0",
          exact: true,
        })
        .click();
      await layout("cobertura-modal", width);
      await page
        .getByRole("button", { name: "Salvar cobertura", exact: true })
        .click();
      await page.locator("dialog").waitFor({ state: "detached" });
      await page.goto("http://127.0.0.1:3042/gestao/filas");
      await page.getByLabel("Responsável PNR TEST-PNR").waitFor();
      await layout("filas", width);
      await page
        .getByLabel("Responsável PNR TEST-PNR")
        .selectOption("22222222-2222-4222-8222-222222222222");
      await page
        .getByLabel("Justificativa")
        .fill("Transferência sintética para revisão local");
      await layout("transferencia-modal", width);
      await page.keyboard.press("Escape");
      await page.locator("dialog").waitFor({ state: "detached" });
      await page.goto("http://127.0.0.1:3042/visao-geral");
      await page.getByText(/^R\$\s1\.200,50$/).waitFor();
      await page
        .getByRole("heading", { name: "Resumo da sincronização", exact: true })
        .scrollIntoViewIfNeeded();
      await page
        .locator(".sync-summary")
        .evaluate((element) =>
          window.scrollBy(0, element.getBoundingClientRect().top - 104),
        );
      await layout("visao-geral", width);
      const finances = await page
        .getByRole("region", { name: "Indicadores financeiros", exact: true })
        .innerText();
      assert(finances.includes("—") && !finances.includes("R$ 0,00"));
      await page.goto("http://127.0.0.1:3042/admin");
      await page
        .getByRole("switch", { name: "Respostas automáticas", exact: true })
        .waitFor();
      await layout("automacoes", width);
      assert(
        !(await page
          .getByRole("switch", {
            name: "Notificações aos motoristas",
            exact: true,
          })
          .isChecked()),
      );
      await page.goto("http://127.0.0.1:3042/admin?ai");
      await page
        .getByRole("button", { name: "Configurar IA", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Substituir credencial", exact: true })
        .click();
      await page
        .getByLabel("API Key", { exact: true })
        .fill("synthetic-never-a-real-key");
      await page
        .getByRole("heading", { name: "Provedor de IA", exact: true })
        .scrollIntoViewIfNeeded();
      await layout("ia-configuracao", width);
      await page
        .getByRole("button", { name: "Testar conexão", exact: true })
        .click();
      await layout("ia-confirmacao", width);
      assert(
        (await page.locator("dialog").innerText()).includes(
          "pode ser faturada",
        ),
      );
      await page
        .locator("dialog")
        .getByRole("button", { name: "Cancelar", exact: true })
        .click();
      assert(
        !(await page.evaluate(() =>
          window.reviewRequests.some((request) => request.path === "ai-test"),
        )),
      );
      await page.evaluate(() =>
        window.dispatchEvent(
          new Event("alc-atendimento:private-content-cleared"),
        ),
      );
      await page
        .getByLabel("API Key", { exact: true })
        .waitFor({ state: "detached" });
    }
    assert(errors.length === 0, errors.join("\n"));
    return {
      synthetic: true,
      layouts: results.length,
      results,
      pageErrors: errors,
    };
  } finally {
    page.off("pageerror", onError);
  }
}
