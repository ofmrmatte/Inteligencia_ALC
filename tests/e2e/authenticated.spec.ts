import { expect, test } from "@playwright/test";

async function signIn(page: import("@playwright/test").Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

const userEmail = process.env.E2E_USER_EMAIL;
const userPassword = process.env.E2E_USER_PASSWORD;
const adminEmail = process.env.E2E_ADMIN_EMAIL;
const adminPassword = process.env.E2E_ADMIN_PASSWORD;

test.describe("common user journey", () => {
  test.skip(!userEmail || !userPassword, "E2E_USER_EMAIL/E2E_USER_PASSWORD not configured.");

  test("logs in, navigates read-only modules and logs out", async ({ page }) => {
    await signIn(page, userEmail!, userPassword!);
    for (const route of ["/dashboard", "/pre-fatura", "/gestao-pacotes", "/desvios-pnr", "/pacotes-faltantes", "/perfil"]) {
      await page.goto(route);
      await expect(page).not.toHaveURL(/\/login/);
    }
    await page.locator(".user-menu__trigger").click();
    await page.getByRole("button", { name: /sair/i }).click();
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("admin journey", () => {
  test.skip(!adminEmail || !adminPassword, "E2E_ADMIN_EMAIL/E2E_ADMIN_PASSWORD not configured.");

  test("opens configuration sections without performing writes", async ({ page }) => {
    await signIn(page, adminEmail!, adminPassword!);
    await page.goto("/configuracoes");
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByText(/usuários|usuarios/i).first()).toBeVisible();
    await expect(page.getByText(/meta/i).first()).toBeVisible();
    await expect(page.getByText(/auditoria/i).first()).toBeVisible();
  });
});
