import { env } from "./config/env.js";
import { app } from "./app.js";

app.listen(env.port, () => {
  console.log(`API do Painel de Inteligência Operacional em http://localhost:${env.port}/api`);
});

