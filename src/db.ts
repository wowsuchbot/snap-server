/**
 * Snap Server — SQLite database layer
 *
 * Two tables:
 *  - snaps: stores the snap JSON for each snap ID
 *  - snap_state: per-snap, per-FID persistent state (for toggle/input values, counters, etc.)
 */

import Database from "better-sqlite3";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.SNAP_DB_PATH || join(__dirname, "..", "data", "snaps.db");

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma("journal_mode = WAL");
    _db.pragma("foreign_keys = ON");
    migrate(_db);
  }
  return _db;
}

function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS snaps (
      id         TEXT PRIMARY KEY,
      json       TEXT NOT NULL,
      app_name   TEXT,
      cast_hash  TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS snap_state (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      snap_id    TEXT NOT NULL REFERENCES snaps(id) ON DELETE CASCADE,
      fid        INTEGER NOT NULL,
      key        TEXT NOT NULL,
      value      TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(snap_id, fid, key)
    );

    CREATE INDEX IF NOT EXISTS idx_snap_state_lookup ON snap_state(snap_id, fid);
    CREATE INDEX IF NOT EXISTS idx_snaps_cast ON snaps(cast_hash);
    CREATE INDEX IF NOT EXISTS idx_snaps_app ON snaps(app_name);
  `);
}

// ---------------------------------------------------------------------------
// Snap CRUD
// ---------------------------------------------------------------------------

export interface SnapRow {
  id: string;
  json: string;
  app_name: string | null;
  cast_hash: string | null;
  created_at: string;
  updated_at: string;
}

export function createSnap(
  id: string,
  json: string,
  opts?: { app_name?: string; cast_hash?: string },
): SnapRow {
  const db = getDb();
  const stmt = db.prepare(
    "INSERT INTO snaps (id, json, app_name, cast_hash) VALUES (?, ?, ?, ?)",
  );
  stmt.run(id, json, opts?.app_name ?? null, opts?.cast_hash ?? null);
  return getSnap(id)!;
}

export function getSnap(id: string): SnapRow | null {
  const db = getDb();
  return db.prepare("SELECT * FROM snaps WHERE id = ?").get(id) as SnapRow | undefined ?? null;
}

export function updateSnap(id: string, json: string): SnapRow {
  const db = getDb();
  db.prepare("UPDATE snaps SET json = ?, updated_at = datetime('now') WHERE id = ?").run(json, id);
  return getSnap(id)!;
}

export function upsertSnap(
  id: string,
  json: string,
  opts?: { app_name?: string; cast_hash?: string },
): SnapRow {
  const existing = getSnap(id);
  if (existing) {
    return updateSnap(id, json);
  }
  return createSnap(id, json, opts);
}

export function deleteSnap(id: string): boolean {
  const db = getDb();
  const result = db.prepare("DELETE FROM snaps WHERE id = ?").run(id);
  return result.changes > 0;
}

export function listSnaps(opts?: { app_name?: string; limit?: number; offset?: number }): SnapRow[] {
  const db = getDb();
  const limit = opts?.limit ?? 50;
  const offset = opts?.offset ?? 0;

  if (opts?.app_name) {
    return db
      .prepare("SELECT * FROM snaps WHERE app_name = ? ORDER BY created_at DESC LIMIT ? OFFSET ?")
      .all(opts.app_name, limit, offset) as SnapRow[];
  }

  return db
    .prepare("SELECT * FROM snaps ORDER BY created_at DESC LIMIT ? OFFSET ?")
    .all(limit, offset) as SnapRow[];
}

// ---------------------------------------------------------------------------
// Snap State (per-FID persistent data)
// ---------------------------------------------------------------------------

export function getSnapState(snapId: string, fid: number): Record<string, string> {
  const db = getDb();
  const rows = db
    .prepare("SELECT key, value FROM snap_state WHERE snap_id = ? AND fid = ?")
    .all(snapId, fid) as { key: string; value: string }[];

  const state: Record<string, string> = {};
  for (const row of rows) {
    state[row.key] = row.value;
  }
  return state;
}

export function setSnapState(snapId: string, fid: number, key: string, value: string): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO snap_state (snap_id, fid, key, value, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(snap_id, fid, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
  ).run(snapId, fid, key, value);
}

export function setSnapStateBulk(snapId: string, fid: number, state: Record<string, string>): void {
  const db = getDb();
  const upsert = db.prepare(
    `INSERT INTO snap_state (snap_id, fid, key, value, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(snap_id, fid, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
  );

  const tx = db.transaction((entries: Array<[string, string]>) => {
    for (const [key, value] of entries) {
      upsert.run(snapId, fid, key, value);
    }
  });

  tx(Object.entries(state));
}
