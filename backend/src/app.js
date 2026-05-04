import cors from "cors";
import express from "express";
import { env } from "./config/env.js";
import "./config/database.js";
import { errorMiddleware, notFoundMiddleware } from "./middlewares/errorMiddleware.js";
import { authRoutes } from "./routes/authRoutes.js";
import { protectedRoutes } from "./routes/protectedRoutes.js";
import { userRoutes } from "./routes/userRoutes.js";

export const app = express();

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || origin === "null" || env.frontendUrls.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("Origem não permitida pelo CORS."));
    },
    credentials: true,
  }),
);

app.use(express.json({ limit: "25mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "Painel de Inteligência Operacional API" });
});

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api", protectedRoutes);

app.use(notFoundMiddleware);
app.use(errorMiddleware);

