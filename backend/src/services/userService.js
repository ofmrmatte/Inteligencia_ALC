import { db } from "../config/database.js";
import { hashPassword } from "../utils/password.js";

const userFields = `
  id,
  name,
  email,
  role,
  is_admin AS isAdmin,
  active,
  created_at AS createdAt,
  updated_at AS updatedAt
`;

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function normalizeRole(role, isAdmin = false) {
  return role === "admin" || isAdmin === true ? "admin" : "user";
}

function toPublicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    isAdmin: Boolean(row.isAdmin),
    active: Boolean(row.active),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toPrivateUser(row) {
  if (!row) return null;
  return {
    ...toPublicUser(row),
    passwordHash: row.password_hash,
  };
}

export function listUsers() {
  return db.prepare(`SELECT ${userFields} FROM users ORDER BY created_at ASC`).all().map(toPublicUser);
}

export function getUserById(id) {
  return toPublicUser(db.prepare(`SELECT ${userFields} FROM users WHERE id = ?`).get(id));
}

export function getPrivateUserByEmail(email) {
  return toPrivateUser(
    db
      .prepare(
        `SELECT ${userFields}, password_hash FROM users WHERE email = ?`,
      )
      .get(normalizeEmail(email)),
  );
}

export function getPrivateUserById(id) {
  return toPrivateUser(db.prepare(`SELECT ${userFields}, password_hash FROM users WHERE id = ?`).get(id));
}

export function countAdmins() {
  return db.prepare("SELECT COUNT(*) AS total FROM users WHERE is_admin = 1 AND active = 1").get().total;
}

export function emailExists(email, ignoredUserId = null) {
  const normalized = normalizeEmail(email);
  const row = ignoredUserId
    ? db.prepare("SELECT id FROM users WHERE email = ? AND id <> ?").get(normalized, ignoredUserId)
    : db.prepare("SELECT id FROM users WHERE email = ?").get(normalized);
  return Boolean(row);
}

export async function createUser({ name, email, password, role = "user", isAdmin = false }) {
  const normalizedEmail = normalizeEmail(email);
  const normalizedRole = normalizeRole(role, isAdmin);
  if (!normalizedEmail || !normalizedEmail.includes("@")) {
    const error = new Error("Informe um e-mail válido.");
    error.status = 400;
    throw error;
  }
  if (String(password || "").length < 6) {
    const error = new Error("A senha precisa ter pelo menos 6 caracteres.");
    error.status = 400;
    throw error;
  }
  if (emailExists(normalizedEmail)) {
    const error = new Error("E-mail já cadastrado.");
    error.status = 409;
    throw error;
  }

  const passwordHash = await hashPassword(password);
  const result = db
    .prepare(
      `
      INSERT INTO users (name, email, password_hash, role, is_admin, active)
      VALUES (?, ?, ?, ?, ?, 1)
    `,
    )
    .run(String(name || "Usuário").trim() || "Usuário", normalizedEmail, passwordHash, normalizedRole, normalizedRole === "admin" ? 1 : 0);

  return getUserById(result.lastInsertRowid);
}

export function updateUser(id, changes = {}) {
  const current = getUserById(id);
  if (!current) {
    const error = new Error("Usuário não encontrado.");
    error.status = 404;
    throw error;
  }

  const nextName = String(changes.name ?? current.name).trim() || current.name;
  const nextEmail = normalizeEmail(changes.email ?? current.email);
  const nextRole = normalizeRole(changes.role ?? current.role, changes.isAdmin ?? current.isAdmin);
  const nextActive = changes.active === undefined ? current.active : Boolean(changes.active);

  if (!nextEmail || !nextEmail.includes("@")) {
    const error = new Error("Informe um e-mail válido.");
    error.status = 400;
    throw error;
  }
  if (emailExists(nextEmail, id)) {
    const error = new Error("E-mail já cadastrado.");
    error.status = 409;
    throw error;
  }
  if (current.isAdmin && (nextRole !== "admin" || !nextActive) && countAdmins() <= 1) {
    const error = new Error("Não é permitido remover o último administrador.");
    error.status = 400;
    throw error;
  }

  db.prepare(
    `
    UPDATE users
    SET name = ?, email = ?, role = ?, is_admin = ?, active = ?
    WHERE id = ?
  `,
  ).run(nextName, nextEmail, nextRole, nextRole === "admin" ? 1 : 0, nextActive ? 1 : 0, id);

  return getUserById(id);
}

export function updateUserAdmin(id, isAdmin) {
  return updateUser(id, { role: isAdmin ? "admin" : "user", isAdmin: Boolean(isAdmin) });
}

export function deleteUser(id) {
  const current = getUserById(id);
  if (!current) {
    const error = new Error("Usuário não encontrado.");
    error.status = 404;
    throw error;
  }
  if (current.isAdmin && countAdmins() <= 1) {
    const error = new Error("Não é permitido remover o último administrador.");
    error.status = 400;
    throw error;
  }
  db.prepare("DELETE FROM users WHERE id = ?").run(id);
}

