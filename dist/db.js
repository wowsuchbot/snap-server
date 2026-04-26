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
let _db = null;
export function getDb() {
    if (!_db) {
        _db = new Database(DB_PATH);
        _db.pragma("journal_mode = WAL");
        _db.pragma("foreign_keys = ON");
        migrate(_db);
    }
    return _db;
}
function migrate(db) {
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
export function createSnap(id, json, opts) {
    const db = getDb();
    const stmt = db.prepare("INSERT INTO snaps (id, json, app_name, cast_hash) VALUES (?, ?, ?, ?)");
    stmt.run(id, json, opts?.app_name ?? null, opts?.cast_hash ?? null);
    return getSnap(id);
}
export function getSnap(id) {
    const db = getDb();
    return db.prepare("SELECT * FROM snaps WHERE id = ?").get(id) ?? null;
}
export function updateSnap(id, json) {
    const db = getDb();
    db.prepare("UPDATE snaps SET json = ?, updated_at = datetime('now') WHERE id = ?").run(json, id);
    return getSnap(id);
}
export function upsertSnap(id, json, opts) {
    const existing = getSnap(id);
    if (existing) {
        return updateSnap(id, json);
    }
    return createSnap(id, json, opts);
}
export function deleteSnap(id) {
    const db = getDb();
    const result = db.prepare("DELETE FROM snaps WHERE id = ?").run(id);
    return result.changes > 0;
}
export function listSnaps(opts) {
    const db = getDb();
    const limit = opts?.limit ?? 50;
    const offset = opts?.offset ?? 0;
    if (opts?.app_name) {
        return db
            .prepare("SELECT * FROM snaps WHERE app_name = ? ORDER BY created_at DESC LIMIT ? OFFSET ?")
            .all(opts.app_name, limit, offset);
    }
    return db
        .prepare("SELECT * FROM snaps ORDER BY created_at DESC LIMIT ? OFFSET ?")
        .all(limit, offset);
}
// ---------------------------------------------------------------------------
// Snap State (per-FID persistent data)
// ---------------------------------------------------------------------------
export function getSnapState(snapId, fid) {
    const db = getDb();
    const rows = db
        .prepare("SELECT key, value FROM snap_state WHERE snap_id = ? AND fid = ?")
        .all(snapId, fid);
    const state = {};
    for (const row of rows) {
        state[row.key] = row.value;
    }
    return state;
}
export function setSnapState(snapId, fid, key, value) {
    const db = getDb();
    db.prepare(`INSERT INTO snap_state (snap_id, fid, key, value, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(snap_id, fid, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`).run(snapId, fid, key, value);
}
export function setSnapStateBulk(snapId, fid, state) {
    const db = getDb();
    const upsert = db.prepare(`INSERT INTO snap_state (snap_id, fid, key, value, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(snap_id, fid, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`);
    const tx = db.transaction((entries) => {
        for (const [key, value] of entries) {
            upsert.run(snapId, fid, key, value);
        }
    });
    tx(Object.entries(state));
}
