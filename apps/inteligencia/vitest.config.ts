import { defineConfig } from "vitest/config";
export default defineConfig({
  resolve: { alias: { "@": import.meta.dirname } },
  test: {
    environment: "node",
    // PostgreSQL integration files share the same disposable Core database.
    fileParallelism: !process.env.ATENDIMENTO_TEST_CORE_URL,
    coverage: { reporter: ["text", "json"] },
  },
});
