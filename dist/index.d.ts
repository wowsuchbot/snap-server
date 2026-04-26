/**
 * Snap Server — main entry point
 *
 * Self-hosted snap renderer on snap.mxjxn.com
 *
 * GET  /:id              → serve snap JSON from SQLite
 * POST /:id              → handle button tap (JFS verified, with handler routing)
 * GET  /api/snaps/:id    → get snap metadata + JSON
 * POST /api/snaps        → create or update a snap
 * POST /api/templates/:name → expand template + deploy (returns URLs)
 * GET  /api/templates     → list available templates
 * DELETE /api/snaps/:id  → delete a snap
 * GET  /health           → health check
 */
export {};
