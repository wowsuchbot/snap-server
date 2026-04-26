/**
 * Snap Server — extended database layer
 *
 * Adds tables for interactive snap patterns:
 *  - poll_votes: per-snap, per-option vote tracking
 *  - snap_submissions: form/data submissions keyed by FID
 *  - snap_claims: per-snap, per-FID once-only claims
 *  - snap_rate_limits: per-snap, per-FID rate limiting
 */

import Database from "better-sqlite3";
import { getDb } from "./db.js";

// Ensure migration runs after base db.ts migration
let _migrated = false;

export function ensureMigrated() {
  if (_migrated) return;
  const db = getDb();
  db.exec(`
    -- Poll votes: one row per (snap_id, option, fid)
    CREATE TABLE IF NOT EXISTS poll_votes (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      snap_id    TEXT NOT NULL,
      option     TEXT NOT NULL,
      fid        INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(snap_id, fid)
    );
    CREATE INDEX IF NOT EXISTS idx_poll_votes_snap ON poll_votes(snap_id);

    -- Generic form submissions: per-snap, per-FID submission data
    CREATE TABLE IF NOT EXISTS snap_submissions (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      snap_id    TEXT NOT NULL,
      fid        INTEGER NOT NULL,
      data       TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_submissions_snap ON snap_submissions(snap_id);

    -- Once-only claims (token claims, NFT claims, etc.)
    CREATE TABLE IF NOT EXISTS snap_claims (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      snap_id    TEXT NOT NULL,
      fid        INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(snap_id, fid)
    );
    CREATE INDEX IF NOT EXISTS idx_claims_snap ON snap_claims(snap_id);

    -- Rate limiting: per-snap, per-FID, per-minute tracking
    CREATE TABLE IF NOT EXISTS snap_rate_limits (
      snap_id    TEXT NOT NULL,
      fid        INTEGER NOT NULL,
      action     TEXT NOT NULL DEFAULT 'submit',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_rate_limits_lookup ON snap_rate_limits(snap_id, fid, action);

    -- Snap metadata: stores template type and handler config
    CREATE TABLE IF NOT EXISTS snap_meta (
      snap_id    TEXT PRIMARY KEY,
      template   TEXT NOT NULL,
      config     TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Ratings: per-snap, per-FID numeric rating
    CREATE TABLE IF NOT EXISTS snap_ratings (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      snap_id    TEXT NOT NULL,
      fid        INTEGER NOT NULL,
      rating     REAL NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(snap_id, fid)
    );
    CREATE INDEX IF NOT EXISTS idx_ratings_snap ON snap_ratings(snap_id);
  `);
  _migrated = true;
}

// ---------------------------------------------------------------------------
// Poll votes
// ---------------------------------------------------------------------------

export function castVote(snapId: string, option: string, fid: number): { success: boolean; already: boolean; counts: Record<string, number> } {
  ensureMigrated();
  const db = getDb();

  // Check if already voted
  const existing = db.prepare("SELECT option FROM poll_votes WHERE snap_id = ? AND fid = ?").get(snapId, fid);
  if (existing) {
    const counts = getVoteCounts(snapId);
    return { success: false, already: true, counts };
  }

  db.prepare("INSERT INTO poll_votes (snap_id, option, fid) VALUES (?, ?, ?)").run(snapId, option, fid);
  const counts = getVoteCounts(snapId);
  return { success: true, already: false, counts };
}

export function getVoteCounts(snapId: string): Record<string, number> {
  ensureMigrated();
  const db = getDb();
  const rows = db.prepare("SELECT option, COUNT(*) as count FROM poll_votes WHERE snap_id = ? GROUP BY option").all(snapId) as { option: string; count: number }[];
  const counts: Record<string, number> = {};
  for (const row of rows) counts[row.option] = row.count;
  return counts;
}

export function getVoteCount(snapId: string, option: string): number {
  ensureMigrated();
  const db = getDb();
  const row = db.prepare("SELECT COUNT(*) as count FROM poll_votes WHERE snap_id = ? AND option = ?").get(snapId, option) as { count: number };
  return row.count;
}

export function hasVoted(snapId: string, fid: number): string | null {
  ensureMigrated();
  const db = getDb();
  const row = db.prepare("SELECT option FROM poll_votes WHERE snap_id = ? AND fid = ?").get(snapId, fid) as { option: string } | undefined;
  return row?.option ?? null;
}

// ---------------------------------------------------------------------------
// Form submissions
// ---------------------------------------------------------------------------

export function submitForm(snapId: string, fid: number, data: Record<string, string>): number {
  ensureMigrated();
  const db = getDb();
  const result = db.prepare("INSERT INTO snap_submissions (snap_id, fid, data) VALUES (?, ?, ?)").run(snapId, fid, JSON.stringify(data));
  return result.lastInsertRowid as number;
}

export function getSubmissions(snapId: string, limit = 50): Array<{ fid: number; data: Record<string, string>; created_at: string }> {
  ensureMigrated();
  const db = getDb();
  const rows = db.prepare("SELECT fid, data, created_at FROM snap_submissions WHERE snap_id = ? ORDER BY created_at DESC LIMIT ?").all(snapId, limit) as { fid: number; data: string; created_at: string }[];
  return rows.map(r => ({ fid: r.fid, data: JSON.parse(r.data), created_at: r.created_at }));
}

export function getSubmissionCount(snapId: string): number {
  ensureMigrated();
  const db = getDb();
  const row = db.prepare("SELECT COUNT(*) as count FROM snap_submissions WHERE snap_id = ?").get(snapId) as { count: number };
  return row.count;
}

// ---------------------------------------------------------------------------
// Claims (once-only actions)
// ---------------------------------------------------------------------------

export function claimSnap(snapId: string, fid: number): { success: boolean; already: boolean } {
  ensureMigrated();
  const db = getDb();
  const existing = db.prepare("SELECT id FROM snap_claims WHERE snap_id = ? AND fid = ?").get(snapId, fid);
  if (existing) return { success: false, already: true };

  db.prepare("INSERT INTO snap_claims (snap_id, fid) VALUES (?, ?)").run(snapId, fid);
  return { success: true, already: false };
}

export function hasClaimed(snapId: string, fid: number): boolean {
  ensureMigrated();
  const db = getDb();
  const row = db.prepare("SELECT id FROM snap_claims WHERE snap_id = ? AND fid = ?").get(snapId, fid);
  return !!row;
}

export function getClaimCount(snapId: string): number {
  ensureMigrated();
  const db = getDb();
  const row = db.prepare("SELECT COUNT(*) as count FROM snap_claims WHERE snap_id = ?").get(snapId) as { count: number };
  return row.count;
}

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

const DEFAULT_RATE_LIMIT_SECONDS = 10;

export function checkRateLimit(snapId: string, fid: number, action = "submit", windowSeconds = DEFAULT_RATE_LIMIT_SECONDS): { allowed: boolean; retryAfter: number } {
  ensureMigrated();
  const db = getDb();

  // Clean old entries
  db.prepare("DELETE FROM snap_rate_limits WHERE snap_id = ? AND fid = ? AND action = ? AND created_at < datetime('now', ?)").run(
    snapId, fid, action, `-${windowSeconds} seconds`
  );

  // Count recent actions
  const row = db.prepare("SELECT COUNT(*) as count FROM snap_rate_limits WHERE snap_id = ? AND fid = ? AND action = ?").get(snapId, fid, action) as { count: number };

  if (row.count > 0) {
    // Get oldest entry to calculate retry_after
    const oldest = db.prepare("SELECT created_at FROM snap_rate_limits WHERE snap_id = ? AND fid = ? AND action = ? ORDER BY created_at ASC LIMIT 1").get(snapId, fid, action) as { created_at: string };
    const then = new Date(oldest.created_at + "Z").getTime();
    const retryAfter = Math.max(1, Math.ceil(windowSeconds - (Date.now() - then) / 1000));
    return { allowed: false, retryAfter };
  }

  // Record this action
  db.prepare("INSERT INTO snap_rate_limits (snap_id, fid, action) VALUES (?, ?, ?)").run(snapId, fid, action);
  return { allowed: true, retryAfter: 0 };
}

// ---------------------------------------------------------------------------
// Snap metadata (template type, handler config)
// ---------------------------------------------------------------------------

export interface SnapMeta {
  snap_id: string;
  template: string;
  config: Record<string, any>;
  created_at: string;
}

export function setSnapMeta(snapId: string, template: string, config: Record<string, any> = {}): void {
  ensureMigrated();
  const db = getDb();
  db.prepare(`
    INSERT INTO snap_meta (snap_id, template, config) VALUES (?, ?, ?)
    ON CONFLICT(snap_id) DO UPDATE SET template = excluded.template, config = excluded.config
  `).run(snapId, template, JSON.stringify(config));
}

export function getSnapMeta(snapId: string): SnapMeta | null {
  ensureMigrated();
  const db = getDb();
  const row = db.prepare("SELECT * FROM snap_meta WHERE snap_id = ?").get(snapId) as { snap_id: string; template: string; config: string; created_at: string } | undefined;
  if (!row) return null;
  return { snap_id: row.snap_id, template: row.template, config: JSON.parse(row.config), created_at: row.created_at };
}

export function deleteSnapMeta(snapId: string): void {
  ensureMigrated();
  const db = getDb();
  db.prepare("DELETE FROM snap_meta WHERE snap_id = ?").run(snapId);
}

// ---------------------------------------------------------------------------
// Ratings
// ---------------------------------------------------------------------------

export function castRating(snapId: string, rating: number, fid: number): { success: boolean; already: boolean; avg: number; count: number } {
  ensureMigrated();
  const db = getDb();

  const existing = db.prepare("SELECT rating FROM snap_ratings WHERE snap_id = ? AND fid = ?").get(snapId, fid) as { rating: number } | undefined;
  if (existing) {
    const stats = getRatingStats(snapId);
    return { success: false, already: true, ...stats };
  }

  db.prepare("INSERT INTO snap_ratings (snap_id, fid, rating) VALUES (?, ?, ?)").run(snapId, fid, rating);
  const stats = getRatingStats(snapId);
  return { success: true, already: false, ...stats };
}

export function getRatingStats(snapId: string): { avg: number; count: number } {
  ensureMigrated();
  const db = getDb();
  const row = db.prepare("SELECT AVG(rating) as avg, COUNT(*) as count FROM snap_ratings WHERE snap_id = ?").get(snapId) as { avg: number; count: number };
  return { avg: Math.round((row.avg || 0) * 10) / 10, count: row.count };
}

export function getUserRating(snapId: string, fid: number): number | null {
  ensureMigrated();
  const db = getDb();
  const row = db.prepare("SELECT rating FROM snap_ratings WHERE snap_id = ? AND fid = ?").get(snapId, fid) as { rating: number } | undefined;
  return row?.rating ?? null;
}
