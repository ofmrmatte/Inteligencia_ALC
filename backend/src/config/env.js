import dotenv from "dotenv";

dotenv.config();

function parseList(value) {
  return String(value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export const env = {
  port: Number(process.env.PORT || 3001),
  jwtSecret: process.env.JWT_SECRET || "trocar_essa_chave_em_producao",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  databaseUrl: process.env.DATABASE_URL || "./src/database/app.db",
  frontendUrls: parseList(process.env.FRONTEND_URL || "http://localhost:3000"),
  nodeEnv: process.env.NODE_ENV || "development",
};

