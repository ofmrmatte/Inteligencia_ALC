import { createServer } from "vite";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
const root = fileURLToPath(new URL("../../../..", import.meta.url));
const review = resolve(root, "apps/atendimento/tests/visual-review");
const build = resolve(root, "apps/atendimento/.next/static");
const fontCss = readdirSync(resolve(build, "chunks"))
  .filter((f) => f.endsWith(".css"))
  .flatMap(
    (f) =>
      readFileSync(resolve(build, "chunks", f), "utf8").match(
        /@font-face\{[^}]*\}/g,
      ) || [],
  )
  .join("\n")
  .replaceAll("../media/", "/__fonts/");
const server = await createServer({
  root: review,
  publicDir: resolve(root, "apps/atendimento/public"),
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: {
      "@/": resolve(root, "apps/atendimento") + "/",
      "@alc/ui": resolve(root, "packages/ui"),
      "@alc/identity": resolve(root, "packages/identity"),
      "next/image": resolve(review, "image.ts"),
      "next/link": resolve(review, "platform.tsx"),
      "next/navigation": resolve(review, "platform.tsx"),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 3042,
    strictPort: true,
    fs: { allow: [root] },
  },
  plugins: [
    {
      name: "local-review-fonts",
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          if (request.url === "/api/events") {
            response.setHeader("Content-Type", "text/event-stream");
            response.setHeader("Cache-Control", "no-store");
            response.write(": local fixture\n\n");
          } else if (request.url === "/__fonts.css") {
            response.setHeader("Content-Type", "text/css");
            response.end(fontCss);
          } else if (
            /^\/__fonts\/[a-zA-Z0-9._-]+\.woff2$/.test(request.url || "")
          ) {
            response.setHeader("Content-Type", "font/woff2");
            response.end(
              readFileSync(resolve(build, "media", request.url.slice(9))),
            );
          } else next();
        });
      },
    },
  ],
});
await server.listen();
console.log(
  "Local synthetic review only: http://127.0.0.1:3042/gestao/atendentes",
);
