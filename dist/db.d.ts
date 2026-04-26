/**
 * Snap Server — SQLite database layer
 *
 * Two tables:
 *  - snaps: stores the snap JSON for each snap ID
 *  - snap_state: per-snap, per-FID persistent state (for toggle/input values, counters, etc.)
 */
import Database from "better-sqlite3";
export declare function getDb(): Database.Database;
export interface SnapRow {
    id: string;
    json: string;
    app_name: string | null;
    cast_hash: string | null;
    created_at: string;
    updated_at: string;
}
export declare function createSnap(id: string, json: string, opts?: {
    app_name?: string;
    cast_hash?: string;
}): SnapRow;
export declare function getSnap(id: string): SnapRow | null;
export declare function updateSnap(id: string, json: string): SnapRow;
export declare function upsertSnap(id: string, json: string, opts?: {
    app_name?: string;
    cast_hash?: string;
}): SnapRow;
export declare function deleteSnap(id: string): boolean;
export declare function listSnaps(opts?: {
    app_name?: string;
    limit?: number;
    offset?: number;
}): SnapRow[];
export declare function getSnapState(snapId: string, fid: number): Record<string, string>;
export declare function setSnapState(snapId: string, fid: number, key: string, value: string): void;
export declare function setSnapStateBulk(snapId: string, fid: number, state: Record<string, string>): void;
