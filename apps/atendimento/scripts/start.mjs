import { spawn } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const server = spawn(
  process.execPath,
  [
    require.resolve("next/dist/bin/next"),
    "start",
    "--hostname",
    process.env.HOSTNAME || "0.0.0.0",
    "--port",
    process.env.PORT || "3000",
  ],
  { stdio: "inherit" },
);
const worker = spawn(
  process.execPath,
  ["--import", "tsx", new URL("./worker.ts", import.meta.url).pathname],
  { stdio: "inherit" },
);
function stop(signal = "SIGTERM") {
  server.kill(signal);
  worker.kill(signal);
}
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => stop(signal));
server.on("exit", (code) => {
  worker.kill("SIGTERM");
  process.exit(code ?? 1);
});
worker.on("exit", (code) => {
  if (code && !server.killed) {
    server.kill("SIGTERM");
    process.exit(code);
  }
});
