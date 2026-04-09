/**
 * Snap Server — main entry point
 *
 * Self-hosted snap renderer on snap.mxjxn.com
 *
 * GET  /:id              → serve snap JSON from SQLite
 * POST /:id              → handle button tap (JFS verified)
 * GET  /api/snaps/:id    → get snap metadata + JSON
 * POST /api/snaps        → create or update a snap
 * GET  /api/snaps        → list snaps (optional ?app_name= filter)
 * DELETE /api/snaps/:id  → delete a snap
 * GET  /health           → health check
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Context, Next } from "hono";
import { logger } from "hono/logger";
import { serve } from "@hono/node-server";
import { decode, verify } from "@farcaster/jfs";
import { getSnap, upsertSnap, getSnapState, setSnapStateBulk, getDb, listSnaps, deleteSnap } from "./db.js";

const app = new Hono();
const PORT = parseInt(process.env.PORT || "3101", 10);
const BASE_URL = process.env.SNAP_PUBLIC_BASE_URL || `http://localhost:${PORT}`;
const ADMIN_KEY = process.env.SNAP_ADMIN_KEY || "";

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

app.use("*", logger());
app.use("*", cors());

function requireAdmin(c: Context, next: Next) {
  if (!ADMIN_KEY) return next();
  const auth = c.req.header("Authorization");
  if (auth !== `Bearer ${ADMIN_KEY}`) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  return next();
}

// ---------------------------------------------------------------------------
// Health check (must be before /:id catch-all)
// ---------------------------------------------------------------------------

app.get("/health", (c) => {
  const db = getDb();
  const count = db.prepare("SELECT COUNT(*) as n FROM snaps").get() as { n: number };
  return c.json({ status: "ok", snaps: count.n, uptime: process.uptime() });
});

// ---------------------------------------------------------------------------
// Admin API — CRUD for snaps (must be before /:id catch-all)
// ---------------------------------------------------------------------------

app.get("/api/snaps", requireAdmin, (c) => {
  const appName = c.req.query("app_name");
  const limit = parseInt(c.req.query("limit") || "50", 10);
  const offset = parseInt(c.req.query("offset") || "0", 10);
  const snaps = listSnaps({ app_name: appName || undefined, limit, offset });
  return c.json({ snaps, count: snaps.length });
});

app.get("/api/snaps/:id", requireAdmin, (c) => {
  const snap = getSnap(c.req.param("id")!);
  if (!snap) return c.notFound();
  return c.json({ ...snap, json: JSON.parse(snap.json) });
});

app.post("/api/snaps", requireAdmin, async (c) => {
  let body: { id?: string; json?: unknown; app_name?: string; cast_hash?: string };
  try { body = await c.req.json(); } catch { return c.json({ error: "Invalid JSON" }, 400); }

  if (!body.json || typeof body.json !== "object") {
    return c.json({ error: "Missing 'json' field" }, 400);
  }

  const id = body.id || crypto.randomUUID().slice(0, 8);
  const snap = upsertSnap(id, JSON.stringify(body.json), {
    app_name: body.app_name,
    cast_hash: body.cast_hash,
  });

  return c.json({ id: snap.id, url: `${BASE_URL}/${snap.id}`, created: snap.created_at, updated: snap.updated_at }, 201);
});

app.delete("/api/snaps/:id", requireAdmin, (c) => {
  if (!deleteSnap(c.req.param("id")!)) return c.notFound();
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Snap serving — GET /:id (catch-all, must be last)
// ---------------------------------------------------------------------------

app.get("/:id", (c) => {
  const id = c.req.param("id");
  const snap = getSnap(id);
  if (!snap) return c.notFound();

  const accept = c.req.header("Accept") || "";
  if (accept.includes("application/vnd.farcaster.snap+json")) {
    return c.json(JSON.parse(snap.json), 200, {
      "Content-Type": "application/vnd.farcaster.snap+json",
      "Vary": "Accept",
      "Link": `</${id}>; rel="alternate"; type="application/vnd.farcaster.snap+json", </${id}>; rel="alternate"; type="text/html"`,
      "Cache-Control": "public, max-age=0, must-revalidate",
    });
  }

  // HTML fallback with OG tags for embed card rendering
  const snapData = JSON.parse(snap.json);
  const title = snapData.title || id;
  const description = snapData.ui?.elements ? Object.values(snapData.ui.elements)
    .filter((e: any) => e.type === "text" && e.props?.weight !== "bold")
    .map((e: any) => e.props?.content)
    .filter(Boolean)[0] || "A Farcaster snap" : "A Farcaster snap";

  return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<meta name="description" content="${description}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${BASE_URL}/${id}">
<meta property="og:type" content="website">
<meta property="og:locale" content="en_US">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${description}">
</head>
<body>${JSON.stringify(snapData, null, 2)}</body>
</html>`);
});

// ---------------------------------------------------------------------------
// Snap interaction — POST /:id (JFS verified)
// ---------------------------------------------------------------------------

app.post("/:id", async (c) => {
  const id = c.req.param("id");
  const snap = getSnap(id);
  if (!snap) return c.json({ error: "Snap not found" }, 404);

  let body: { header: string; payload: string; signature: string };
  try { body = await c.req.json(); } catch { return c.json({ error: "Invalid JSON" }, 400); }

  const skipVerify = process.env.SKIP_JFS_VERIFICATION === "true";
  let fid: number | null = null;

  if (skipVerify) {
    try {
      fid = JSON.parse(atob(body.payload.replace(/-/g, "+").replace(/_/g, "/")))?.fid ?? 0;
    } catch { fid = 0; }
  } else {
    try {
      await verify({ data: body });
      fid = (decode(body).payload as any)?.fid ?? null;
    } catch (err) {
      console.error(`[snap] JFS verification failed for ${id}:`, err);
      return c.json({ error: "Invalid signature" }, 401);
    }
  }

  // Parse payload for inputs + button_index
  let payloadData: { inputs?: Record<string, string>; button_index?: number } = {};
  try {
    payloadData = JSON.parse(atob(body.payload.replace(/-/g, "+").replace(/_/g, "/")));
  } catch {}

  const inputs = payloadData.inputs || {};
  console.log(`[snap] POST /${id} fid=${fid} inputs=${JSON.stringify(inputs)} button=${payloadData.button_index}`);

  // Persist user inputs as state
  if (fid && Object.keys(inputs).length > 0) {
    setSnapStateBulk(id, fid, inputs);
  }

  // Return snap with accumulated state
  const snapJson = JSON.parse(snap.json);
  const existingState = fid ? getSnapState(id, fid) : {};
  return c.json({ ...snapJson, _state: { ...existingState, ...inputs } }, 200, {
    "Content-Type": "application/vnd.farcaster.snap+json",
  });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

console.log(`[snap-server] Starting on port ${PORT}`);
console.log(`[snap-server] Base URL: ${BASE_URL}`);
console.log(`[snap-server] Admin API: ${ADMIN_KEY ? "protected" : "open (dev mode)"}`);

serve({ fetch: app.fetch, port: PORT });
