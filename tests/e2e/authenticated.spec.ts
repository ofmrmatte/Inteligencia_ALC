import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

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
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function authenticatedSupabase(email: string, password: string) {
  if (!supabaseUrl || !supabaseKey) throw new Error("Supabase E2E environment is not configured.");
  const client = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return client;
}

function missingPackageFixture() {
  const token = `E2E-${Date.now()}-${crypto.randomUUID()}`;
  return {
    data_fechamento: new Date().toISOString().slice(0, 10),
    base: "E2E",
    tipo_base: "XPT",
    driver_nome: "E2E CI",
    id_envio: token,
    caso: "Pacote faltante",
    motivo_original: "Faltante",
    status_caso: "Pendente",
    status_contato_meli: "E-mail Enviado",
    prazo_tratativa: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    situacao_prazo: "Dentro do prazo",
    source_hash: token,
    dedupe_key: `pacotes_faltantes|${token}`,
    raw_data: { source: "authenticated-e2e" },
    module_key: "pacotes_faltantes",
  };
}

test.describe("common user journey", () => {
  test.skip(!userEmail || !userPassword, "E2E_USER_EMAIL/E2E_USER_PASSWORD not configured.");

  test("logs in, navigates read-only modules, cannot access admin APIs and logs out", async ({ page }) => {
    await signIn(page, userEmail!, userPassword!);
    for (const route of ["/dashboard", "/pre-fatura", "/gestao-pacotes", "/desvios-pnr", "/pacotes-faltantes", "/perfil"]) {
      await page.goto(route);
      await expect(page).not.toHaveURL(/\/login/);
    }

    const usersResponse = await page.request.get("/api/configuracoes/users");
    expect(usersResponse.status()).toBe(403);

    const statusResponse = await page.request.post("/api/pacotes-faltantes/status", {
      data: { id: crypto.randomUUID(), status_caso: "Pendente" },
    });
    expect(statusResponse.status()).toBe(403);

    const persistForm = new FormData();
    persistForm.set("persist", "true");
    const importResponse = await page.request.post("/api/pre-fatura/validate", { multipart: { persist: "true" } });
    expect(importResponse.status()).toBe(403);

    await page.goto("/dashboard");
    await page.keyboard.press(process.platform === "darwin" ? "Meta+K" : "Control+K");
    await expect(page.getByRole("dialog", { name: "Busca global" })).toBeVisible();
    await page.getByLabel("Pesquisar no painel").fill("123");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Busca global" })).toBeHidden();
    await page.getByRole("button", { name: /alertas operacionais/i }).click();
    await expect(page.getByRole("dialog", { name: "Central de Alertas Operacionais" })).toBeVisible();
    await page.getByRole("button", { name: "Fechar alertas" }).click();
    await expect(page.getByRole("dialog", { name: "Central de Alertas Operacionais" })).toBeHidden();
    await page.locator(".user-menu__trigger").click();
    await page.getByRole("button", { name: /sair/i }).click();
    await expect(page).toHaveURL(/\/login/);
  });

  test("RLS blocks direct missing-package writes for a common user", async () => {
    const client = await authenticatedSupabase(userEmail!, userPassword!);
    const fixture = missingPackageFixture();
    const { data, error } = await client
      .from("gestao_desvios_pacotes_faltantes")
      .insert(fixture)
      .select("id")
      .maybeSingle();

    if (data?.id && adminEmail && adminPassword) {
      const adminClient = await authenticatedSupabase(adminEmail, adminPassword);
      await adminClient.from("gestao_desvios_pacotes_faltantes").delete().eq("id", data.id);
    }

    expect(data).toBeNull();
    expect(error).toBeTruthy();
  });
});

test.describe("admin journey", () => {
  test.skip(!adminEmail || !adminPassword, "E2E_ADMIN_EMAIL/E2E_ADMIN_PASSWORD not configured.");

  test("opens configuration sections without performing application writes", async ({ page }) => {
    await signIn(page, adminEmail!, adminPassword!);
    await page.goto("/configuracoes");
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByText(/usuários|usuarios/i).first()).toBeVisible();
    await expect(page.getByText(/meta/i).first()).toBeVisible();
    await expect(page.getByText(/auditoria/i).first()).toBeVisible();

    const usersResponse = await page.request.get("/api/configuracoes/users");
    expect(usersResponse.ok()).toBe(true);
  });

  test("RLS allows admin write and cleanup for missing packages", async () => {
    const client = await authenticatedSupabase(adminEmail!, adminPassword!);
    const fixture = missingPackageFixture();
    const { data, error } = await client
      .from("gestao_desvios_pacotes_faltantes")
      .insert(fixture)
      .select("id")
      .single();

    expect(error).toBeNull();
    expect(data?.id).toBeTruthy();

    if (data?.id) {
      const { error: cleanupError } = await client
        .from("gestao_desvios_pacotes_faltantes")
        .delete()
        .eq("id", data.id);
      expect(cleanupError).toBeNull();
    }
  });
});
