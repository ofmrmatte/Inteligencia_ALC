import crypto from "node:crypto";
import http from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 8787);
const DATA_DIR = process.env.PRE_FATURA_DATA_DIR || path.join(__dirname, "data");
const STORE_FILE = process.env.PRE_FATURA_STORE_FILE || path.join(DATA_DIR, "library.json");
const MAX_BODY_BYTES = Number(process.env.MAX_BODY_BYTES || 25 * 1024 * 1024);
const SESSION_TTL_MS = Number(process.env.SESSION_TTL_MS || 1000 * 60 * 60 * 24 * 14);

const DEFAULT_STORE = {
  activeDatasetId: "seed",
  seedDeleted: false,
  datasets: [],
  users: [],
  sessions: [],
};

function corsHeaders(origin = "*") {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

async function ensureStore() {
  await mkdir(DATA_DIR, { recursive: true });
  try {
    await readFile(STORE_FILE, "utf8");
  } catch {
    await writeStore(DEFAULT_STORE);
  }
}

async function readStore() {
  await ensureStore();
  const raw = await readFile(STORE_FILE, "utf8");
  return normalizeStore(safeJson(raw, DEFAULT_STORE));
}

async function writeStore(store) {
  await mkdir(DATA_DIR, { recursive: true });
  const normalized = normalizeStore(store);
  await writeFile(STORE_FILE, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  return normalized;
}

function safeJson(raw, fallback) {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function normalizeStore(input) {
  const datasets = Array.isArray(input?.datasets) ? input.datasets : [];
  const users = Array.isArray(input?.users) ? input.users : [];
  const sessions = Array.isArray(input?.sessions) ? input.sessions : [];
  const normalizedDatasets = datasets.map(normalizeDataset).filter(Boolean);
  const normalizedUsers = users.map(normalizeUser).filter(Boolean);
  const now = Date.now();

  return {
    activeDatasetId: String(input?.activeDatasetId || normalizedDatasets[0]?.id || "seed"),
    seedDeleted: Boolean(input?.seedDeleted),
    datasets: normalizedDatasets,
    users: normalizedUsers,
    sessions: sessions
      .map(normalizeSession)
      .filter((session) => session && new Date(session.expiresAt).getTime() > now),
  };
}

function normalizeDataset(dataset) {
  if (!dataset || typeof dataset !== "object") return null;
  return {
    id: String(dataset.id || dataset.fileName || `dataset-${Date.now()}`),
    fileName: String(dataset.fileName || "arquivo.xlsx"),
    label: String(dataset.label || dataset.fileName || "Arquivo"),
    source: String(dataset.source || "upload"),
    importedAt: String(dataset.importedAt || new Date().toISOString()),
    rows: Array.isArray(dataset.rows) ? dataset.rows : [],
  };
}

function normalizeUser(user) {
  if (!user || typeof user !== "object" || !user.email || !user.passwordHash || !user.salt) return null;
  return {
    id: String(user.id || crypto.randomUUID()),
    name: String(user.name || ""),
    email: String(user.email).trim().toLowerCase(),
    role: user.role === "admin" ? "admin" : "viewer",
    passwordHash: String(user.passwordHash),
    salt: String(user.salt),
    createdAt: String(user.createdAt || new Date().toISOString()),
  };
}

function normalizeSession(session) {
  if (!session || typeof session !== "object" || !session.token || !session.userId || !session.expiresAt) return null;
  return {
    token: String(session.token),
    userId: String(session.userId),
    expiresAt: String(session.expiresAt),
  };
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
  };
}

function libraryPayload(store) {
  return {
    activeDatasetId: store.activeDatasetId,
    seedDeleted: store.seedDeleted,
    datasets: store.datasets,
  };
}

function sendJson(res, statusCode, payload, extraHeaders = {}) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    ...corsHeaders(),
    ...extraHeaders,
  });
  res.end(JSON.stringify(payload));
}

function sendText(res, statusCode, text) {
  res.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    ...corsHeaders(),
  });
  res.end(text);
}

function collectBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("Body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function readJsonBody(req) {
  const raw = await collectBody(req);
  return raw ? safeJson(raw, null) : {};
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return { salt, hash };
}

function verifyPassword(password, user) {
  const candidate = hashPassword(password, user.salt).hash;
  return crypto.timingSafeEqual(Buffer.from(candidate, "hex"), Buffer.from(user.passwordHash, "hex"));
}

function getBearerToken(req) {
  const header = req.headers.authorization || "";
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

function getAuth(store, req) {
  const token = getBearerToken(req);
  if (!token) return { user: null, session: null };
  const session = store.sessions.find((entry) => entry.token === token);
  if (!session) return { user: null, session: null };
  const user = store.users.find((entry) => entry.id === session.userId) || null;
  return { user, session };
}

function authRequired(store, req) {
  if (!store.users.length) return { ok: true, user: null };
  const auth = getAuth(store, req);
  if (!auth.user) return { ok: false, status: 401, error: "Login required" };
  return { ok: true, user: auth.user };
}

function adminRequired(store, req) {
  const auth = authRequired(store, req);
  if (!auth.ok) return auth;
  if (store.users.length && auth.user?.role !== "admin") {
    return { ok: false, status: 403, error: "Admin role required" };
  }
  return auth;
}

async function handleAuthSignup(req, res) {
  const store = await readStore();
  const body = await readJsonBody(req);
  const email = String(body?.email || "").trim().toLowerCase();
  const password = String(body?.password || "");
  const name = String(body?.name || "").trim();

  if (!email || !email.includes("@") || password.length < 6) {
    sendJson(res, 400, { ok: false, error: "Use email válido e senha com pelo menos 6 caracteres." });
    return;
  }
  if (store.users.some((user) => user.email === email)) {
    sendJson(res, 409, { ok: false, error: "Usuário já cadastrado." });
    return;
  }

  const { salt, hash } = hashPassword(password);
  const user = {
    id: crypto.randomUUID(),
    name,
    email,
    role: store.users.length === 0 ? "admin" : "viewer",
    passwordHash: hash,
    salt,
    createdAt: new Date().toISOString(),
  };
  store.users.push(user);
  const saved = await writeStore(store);
  const savedUser = saved.users.find((entry) => entry.id === user.id);
  const session = await createSession(saved, savedUser);
  sendJson(res, 201, { ok: true, user: publicUser(savedUser), token: session.token });
}

async function handleAuthLogin(req, res) {
  const store = await readStore();
  const body = await readJsonBody(req);
  const email = String(body?.email || "").trim().toLowerCase();
  const password = String(body?.password || "");
  const user = store.users.find((entry) => entry.email === email);

  if (!user || !verifyPassword(password, user)) {
    sendJson(res, 401, { ok: false, error: "Email ou senha inválidos." });
    return;
  }

  const session = await createSession(store, user);
  sendJson(res, 200, { ok: true, user: publicUser(user), token: session.token });
}

async function createSession(store, user) {
  const token = crypto.randomBytes(32).toString("hex");
  const session = {
    token,
    userId: user.id,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
  };
  store.sessions.push(session);
  await writeStore(store);
  return session;
}

async function handleAuthLogout(req, res) {
  const store = await readStore();
  const token = getBearerToken(req);
  store.sessions = store.sessions.filter((session) => session.token !== token);
  await writeStore(store);
  sendJson(res, 200, { ok: true });
}

async function handleAuthSession(req, res) {
  const store = await readStore();
  const auth = getAuth(store, req);
  sendJson(res, 200, {
    ok: true,
    authRequired: store.users.length > 0,
    user: publicUser(auth.user),
  });
}

async function handleUsers(req, res) {
  const store = await readStore();
  const auth = adminRequired(store, req);
  if (!auth.ok) {
    sendJson(res, auth.status, { ok: false, error: auth.error });
    return;
  }

  if (req.method === "GET") {
    sendJson(res, 200, { ok: true, users: store.users.map(publicUser) });
    return;
  }

  const match = (req.url || "").match(/^\/api\/users\/([^/?]+)/);
  if (req.method === "PATCH" && match) {
    const userId = decodeURIComponent(match[1]);
    const body = await readJsonBody(req);
    const role = body?.role === "admin" ? "admin" : "viewer";
    const user = store.users.find((entry) => entry.id === userId);
    if (!user) {
      sendJson(res, 404, { ok: false, error: "Usuário não encontrado." });
      return;
    }
    user.role = role;
    const saved = await writeStore(store);
    sendJson(res, 200, { ok: true, users: saved.users.map(publicUser) });
    return;
  }

  sendText(res, 404, "Not found");
}

async function handleRequest(req, res) {
  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders());
    res.end();
    return;
  }

  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (url.pathname === "/api/health" && req.method === "GET") {
    const store = await readStore();
    sendJson(res, 200, {
      ok: true,
      datasets: store.datasets.length,
      users: store.users.length,
      activeDatasetId: store.activeDatasetId,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  if (url.pathname === "/api/auth/signup" && req.method === "POST") {
    await handleAuthSignup(req, res);
    return;
  }

  if (url.pathname === "/api/auth/login" && req.method === "POST") {
    await handleAuthLogin(req, res);
    return;
  }

  if (url.pathname === "/api/auth/logout" && req.method === "POST") {
    await handleAuthLogout(req, res);
    return;
  }

  if (url.pathname === "/api/auth/session" && req.method === "GET") {
    await handleAuthSession(req, res);
    return;
  }

  if (url.pathname === "/api/users" || url.pathname.startsWith("/api/users/")) {
    await handleUsers(req, res);
    return;
  }

  if (url.pathname === "/api/library" && req.method === "GET") {
    const store = await readStore();
    const auth = authRequired(store, req);
    if (!auth.ok) {
      sendJson(res, auth.status, { ok: false, error: auth.error, authRequired: true });
      return;
    }
    sendJson(res, 200, libraryPayload(store));
    return;
  }

  if (url.pathname === "/api/library" && (req.method === "PUT" || req.method === "POST" || req.method === "PATCH")) {
    const store = await readStore();
    const auth = adminRequired(store, req);
    if (!auth.ok) {
      sendJson(res, auth.status, { ok: false, error: auth.error, authRequired: true });
      return;
    }
    const parsed = await readJsonBody(req);
    if (!parsed || typeof parsed !== "object") {
      sendJson(res, 400, { ok: false, error: "Invalid JSON body" });
      return;
    }
    store.activeDatasetId = String(parsed.activeDatasetId || store.activeDatasetId || "seed");
    store.seedDeleted = Boolean(parsed.seedDeleted);
    store.datasets = Array.isArray(parsed.datasets) ? parsed.datasets : [];
    const saved = await writeStore(store);
    sendJson(res, 200, { ok: true, ...libraryPayload(saved) });
    return;
  }

  if (url.pathname === "/api/reset" && req.method === "POST") {
    const store = await readStore();
    const auth = adminRequired(store, req);
    if (!auth.ok) {
      sendJson(res, auth.status, { ok: false, error: auth.error, authRequired: true });
      return;
    }
    store.activeDatasetId = "seed";
    store.seedDeleted = false;
    store.datasets = [];
    const saved = await writeStore(store);
    sendJson(res, 200, { ok: true, ...libraryPayload(saved) });
    return;
  }

  sendText(res, 404, "Not found");
}

const server = http.createServer((req, res) => {
  void handleRequest(req, res).catch((error) => {
    console.error(error);
    sendJson(res, 500, { ok: false, error: "Internal server error" });
  });
});

server.listen(PORT);
