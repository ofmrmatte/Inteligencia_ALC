import { db } from "../config/database.js";

const DEFAULT_LIBRARY = {
  activeDatasetId: "seed",
  seedDeleted: false,
  datasets: [],
};

function safeJson(raw, fallback) {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function getLibrary() {
  const row = db.prepare("SELECT value FROM app_state WHERE key = 'library'").get();
  if (!row) return DEFAULT_LIBRARY;
  return { ...DEFAULT_LIBRARY, ...safeJson(row.value, DEFAULT_LIBRARY) };
}

export function saveLibrary(payload) {
  const value = JSON.stringify({ ...DEFAULT_LIBRARY, ...(payload || {}) });
  db.prepare(
    `
    INSERT INTO app_state (key, value, updated_at)
    VALUES ('library', ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `,
  ).run(value);
  return getLibrary();
}

