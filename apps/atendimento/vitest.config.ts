import { defineConfig } from "vitest/config";
export default defineConfig({
  resolve: { alias: { "@": import.meta.dirname } },
  test: {
    environment: "node",
    // Integration files reset the same disposable PostgreSQL databases.
    fileParallelism: !process.env.ATENDIMENTO_TEST_DATABASE_URL,
  },
});
