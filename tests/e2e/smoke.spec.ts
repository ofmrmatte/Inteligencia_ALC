import { expect, test } from "@playwright/test";

const privateRoutes = [
  "/",
  "/dashboard",
  "/pre-fatura",
  "/gestao-pacotes",
  "/desvios-pnr",
  "/pacotes-faltantes",
  "/perfil",
  "/configuracoes",
];

test("login page renders Inteligência LOSS auth surface", async ({ page }) => {
  await page.goto("/login");
  await expect(page).toHaveTitle("Login | Inteligência LOSS");
  await expect(page.getByRole("img", { name: "Inteligência LOSS" })).toBeVisible();
  await expect(page.getByText("ALC Pereira & Filho").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Bem-vindo" })).toBeVisible();
  await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
  const password = page.getByLabel("Senha", { exact: true });
  await expect(password).toBeVisible();
  await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
  await expect(page.getByLabel("Lembrar sessão neste dispositivo")).toBeChecked();
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute("href", "/brand/alc-favicon.svg");

  await expect(password).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Mostrar senha" }).click();
  await expect(password).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Ocultar senha" }).click();
  await expect(password).toHaveAttribute("type", "password");
});

for (const route of privateRoutes) {
  test(`anonymous user is redirected from ${route} to login`, async ({ page }) => {
    await page.goto(route);
    await expect(page).toHaveURL((url) => {
      const expectedNext = route === "/" ? "/dashboard" : route;
      return url.pathname === "/login" && url.searchParams.get("next") === expectedNext;
    });
  });
}

for (const route of ["/api/search?q=123", "/api/alerts"]) {
  test(`anonymous API request is rejected from ${route}`, async ({ request }) => {
    const response = await request.get(route);
    expect(response.status()).toBe(401);
  });
}
