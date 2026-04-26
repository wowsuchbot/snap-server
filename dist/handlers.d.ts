/**
 * Snap Server — extended database layer
 *
 * Adds tables for interactive snap patterns:
 *  - poll_votes: per-snap, per-option vote tracking
 *  - snap_submissions: form/data submissions keyed by FID
 *  - snap_claims: per-snap, per-FID once-only claims
 *  - snap_rate_limits: per-snap, per-FID rate limiting
 */
export declare function ensureMigrated(): void;
export declare function castVote(snapId: string, option: string, fid: number): {
    success: boolean;
    already: boolean;
    counts: Record<string, number>;
};
export declare function getVoteCounts(snapId: string): Record<string, number>;
export declare function getVoteCount(snapId: string, option: string): number;
export declare function hasVoted(snapId: string, fid: number): string | null;
export declare function submitForm(snapId: string, fid: number, data: Record<string, string>): number;
export declare function getSubmissions(snapId: string, limit?: number): Array<{
    fid: number;
    data: Record<string, string>;
    created_at: string;
}>;
export declare function getSubmissionCount(snapId: string): number;
export declare function claimSnap(snapId: string, fid: number): {
    success: boolean;
    already: boolean;
};
export declare function hasClaimed(snapId: string, fid: number): boolean;
export declare function getClaimCount(snapId: string): number;
export declare function checkRateLimit(snapId: string, fid: number, action?: string, windowSeconds?: number): {
    allowed: boolean;
    retryAfter: number;
};
export interface SnapMeta {
    snap_id: string;
    template: string;
    config: Record<string, any>;
    created_at: string;
}
export declare function setSnapMeta(snapId: string, template: string, config?: Record<string, any>): void;
export declare function getSnapMeta(snapId: string): SnapMeta | null;
export declare function deleteSnapMeta(snapId: string): void;
export declare function castRating(snapId: string, rating: number, fid: number): {
    success: boolean;
    already: boolean;
    avg: number;
    count: number;
};
export declare function getRatingStats(snapId: string): {
    avg: number;
    count: number;
};
export declare function getUserRating(snapId: string, fid: number): number | null;
