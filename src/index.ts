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

import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "@hono/node-server/serve-static";
import type { Context, Next } from "hono";
import { logger } from "hono/logger";
import { serve } from "@hono/node-server";
import { decode, verify } from "@farcaster/jfs";
import { getSnap, upsertSnap, getSnapState, setSnapStateBulk, getDb, listSnaps, deleteSnap } from "./db.js";
import { validateSnapResponse } from "@farcaster/snap";
import { ensureMigrated, setSnapMeta, deleteSnapMeta } from "./handlers.js";
import { expand, listTemplates, getSlotSchema, type TemplateName } from "./templates/engine.js";
import { poll, quiz, claim, tipJar, tokenBuy, tokenShowcase, rating, textEntry } from "./templates/interactive.js";
import { handleSnapPost } from "./router.js";
import statusRoutes from "./routes/status.js";

const app = new Hono();
const PORT = parseInt(process.env.PORT || "3101", 10);
const BASE_URL = process.env.SNAP_PUBLIC_BASE_URL || `http://localhost:${PORT}`;
const ADMIN_KEY = process.env.SNAP_ADMIN_KEY || "";

// Ensure interactive tables exist on startup
ensureMigrated();

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

app.use("*", logger());
app.use("*", cors());

// Inject snap count for status route
app.use("/api/status/*", async (c, next) => {
  const db = getDb();
  const count = (db.prepare("SELECT COUNT(*) as n FROM snaps").get() as { n: number }).n;
  c.set("snapCount", count);
  await next();
});

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
// Template API — expand + deploy in one shot (must be before /:id catch-all)
// ---------------------------------------------------------------------------

app.get("/api/templates", requireAdmin, (c) => {
  const templates = listTemplates();
  const info = templates.map((name) => ({
    name,
    slots: getSlotSchema(name),
  }));

  // Add interactive templates
  const interactiveInfo: Array<{ name: string; slots: Record<string, { type: string; required: boolean; description: string }> }> = [
    { name: "poll", slots: { question: { type: "string", required: true, description: "Poll question" }, options: { type: "string[]", required: true, description: "2-4 options" }, theme: { type: "string", required: false, description: "Accent color" } } },
    { name: "quiz", slots: { baseId: { type: "string", required: true, description: "Base snap ID for pagination" }, questions: { type: "object[]", required: true, description: "1-5 questions with question, options[], correct" }, theme: { type: "string", required: false, description: "Accent color" } } },
    { name: "claim", slots: { title: { type: "string", required: true, description: "Claim title" }, description: { type: "string", required: true, description: "Description text" }, buttonLabel: { type: "string", required: false, description: "Button text" }, theme: { type: "string", required: false, description: "Accent color" } } },
    { name: "tip-jar", slots: { id: { type: "string", required: true, description: "Snap ID" }, title: { type: "string", required: false, description: "Title (default: Tip Jar)" }, description: { type: "string", required: false, description: "Description text" }, recipientFid: { type: "number", required: true, description: "FID to receive tips" }, tokens: { type: "object[]", required: false, description: "Custom tokens [{ label, token, amount? }], defaults to USDC on Base" }, theme: { type: "string", required: false, description: "Accent color" } } },
    { name: "token-buy", slots: { id: { type: "string", required: true, description: "Snap ID" }, title: { type: "string", required: true, description: "Token name" }, description: { type: "string", required: false, description: "Token description" }, buyToken: { type: "string", required: true, description: "CAIP-19 token ID to buy" }, sellToken: { type: "string", required: false, description: "CAIP-19 token to sell (default: ETH)" }, buttonLabel: { type: "string", required: false, description: "Button label" }, badges: { type: "string[]", required: false, description: "Up to 3 badges" }, theme: { type: "string", required: false, description: "Accent color" } } },
    { name: "token-showcase", slots: { id: { type: "string", required: true, description: "Snap ID" }, title: { type: "string", required: true, description: "Token name" }, description: { type: "string", required: false, description: "Token description" }, token: { type: "string", required: true, description: "CAIP-19 token ID" }, actions: { type: "object[]", required: false, description: "Extra actions [{ type, label, params }]" }, badges: { type: "string[]", required: false, description: "Up to 3 badges" }, theme: { type: "string", required: false, description: "Accent color" } } },
    { name: "rating", slots: { id: { type: "string", required: true, description: "Snap ID" }, subject: { type: "string", required: true, description: "What to rate" }, min: { type: "number", required: false, description: "Min value (default 1)" }, max: { type: "number", required: false, description: "Max value (default 10)" }, step: { type: "number", required: false, description: "Step increment (default 1)" }, label: { type: "string", required: false, description: "Slider label" }, theme: { type: "string", required: false, description: "Accent color (default amber)" } } },
    { name: "text-entry", slots: { id: { type: "string", required: true, description: "Snap ID" }, prompt: { type: "string", required: true, description: "Question/prompt for the user" }, inputName: { type: "string", required: false, description: "POST input key (default: response)" }, inputType: { type: "string", required: false, description: "\"text\" or \"number\" (default: text)" }, placeholder: { type: "string", required: false, description: "Placeholder text (max 60 chars)" }, maxLength: { type: "number", required: false, description: "Max input length (1-280)" }, buttonLabel: { type: "string", required: false, description: "Button text (default: Submit)" }, theme: { type: "string", required: false, description: "Accent color (default teal)" } } },
  ];
  info.push(...(interactiveInfo as any));

  return c.json({ templates: info });
});

app.post("/api/templates/:name", requireAdmin, async (c) => {
  const templateName = c.req.param("name") as string;
  let slots: Record<string, any>;

  try { slots = await c.req.json(); } catch { return c.json({ error: "Invalid JSON" }, 400); }

  try {
    const result = await deployTemplate(templateName, slots);
    return c.json(result, 201);
  } catch (err: any) {
    console.error(`[snap] Template deploy failed:`, err.message);
    return c.json({ error: err.message }, 400);
  }
});

/**
 * Expand a template and deploy all pages to the snap server.
 * Returns deployment info with URLs.
 */
async function deployTemplate(
  templateName: string,
  slots: Record<string, any>,
): Promise<{ template: string; pages: Array<{ id: string; url: string }> }> {
  const interactiveTemplates = ["poll", "quiz", "claim", "tip-jar", "token-buy", "token-showcase", "rating", "text-entry"];

  if (interactiveTemplates.includes(templateName)) {
    return deployInteractiveTemplate(templateName, slots);
  }

  // Static templates
  const templateFn = templateName as TemplateName;
  const result = expand(templateFn, slots);
  const pages = Array.isArray(result) ? result : [result];

  const deployed: Array<{ id: string; url: string }> = [];

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const id = slots.baseId ? `${slots.baseId}-${i}` : `${templateName}-${Date.now().toString(36)}-${i}`;

    // Validate
    const validation = validateSnapResponse(page);
    if (!validation.valid) {
      throw new Error(`Page ${i} validation failed: ${JSON.stringify(validation.issues)}`);
    }

    // Deploy
    upsertSnap(id, JSON.stringify(page), { app_name: templateName });
    deployed.push({ id, url: `${BASE_URL}/${id}` });
  }

  return { template: templateName, pages: deployed };
}

/**
 * Smoke test an interactive snap by simulating a POST with a dev payload.
 * Catches handler crashes (SQL errors, missing functions, etc.) at deploy time
 * instead of discovering them when a real user interacts with the snap.
 */
async function smokeTestInteractive(snapId: string, inputs: Record<string, string>): Promise<void> {
  const TEST_FID = 999999; // Sentinel FID for smoke tests
  try {
    const result = await handleSnapPost(snapId, TEST_FID, inputs, 0);
    if (result) {
      // Validate the handler's response is valid snap JSON
      const validation = validateSnapResponse(result.snapJson);
      if (!validation.valid) {
        throw new Error(`Handler returned invalid snap JSON: ${JSON.stringify(validation.issues)}`);
      }
      console.log(`[snap] Smoke test PASSED for ${snapId}`);
    } else {
      throw new Error(`Handler returned null — snap would just refresh on POST`);
    }
  } catch (err: any) {
    // Clean up: remove the broken snap so it doesn't stay live
    deleteSnap(snapId);
    deleteSnapMeta(snapId);
    throw new Error(
      `Smoke test FAILED for ${snapId}: ${err.message}. ` +
      `Snap was NOT deployed. Fix the handler and try again.`
    );
  }
}

async function deployInteractiveTemplate(
  templateName: string,
  slots: Record<string, any>,
): Promise<{ template: string; pages: Array<{ id: string; url: string }> }> {
  const deployed: Array<{ id: string; url: string }> = [];

  if (templateName === "poll") {
    const { snapJson, meta } = poll(slots as any);

    // Replace {{SELF_URL}} placeholder with actual URL
    const id = slots.id || `poll-${Date.now().toString(36)}`;
    const selfUrl = `${BASE_URL}/${id}`;
    const finalJson = JSON.stringify(snapJson).replace(/\{\{SELF_URL\}\}/g, selfUrl);
    const parsedJson = JSON.parse(finalJson);

    const validation = validateSnapResponse(parsedJson);
    if (!validation.valid) {
      throw new Error(`Poll validation failed: ${JSON.stringify(validation.issues)}`);
    }

    upsertSnap(id, finalJson, { app_name: "poll" });
    setSnapMeta(id, "poll", meta.config);
    deployed.push({ id, url: selfUrl });

    // Smoke test: simulate a POST to verify the handler works
    await smokeTestInteractive(id, { vote: meta.config.options[0] });

  } else if (templateName === "quiz") {
    const { pages: quizPages } = quiz(slots as any);

    for (let i = 0; i < quizPages.length; i++) {
      const { snapJson, meta } = quizPages[i];
      // Last page is quiz-results — use named ID to match template's button target
      const isResultsPage = meta.template === "quiz-results";
      const id = isResultsPage ? `${slots.baseId}-results` : `${slots.baseId}-${i}`;

      const validation = validateSnapResponse(snapJson);
      if (!validation.valid) {
        throw new Error(`Quiz page ${i} validation failed: ${JSON.stringify(validation.issues)}`);
      }

      upsertSnap(id, JSON.stringify(snapJson), { app_name: "quiz" });
      setSnapMeta(id, meta.template, meta.config);
      deployed.push({ id, url: `${BASE_URL}/${id}` });
    }

    // Smoke test first quiz page
    if (quizPages.length > 0) {
      const firstConfig = quizPages[0].meta.config as any;
      await smokeTestInteractive(`${slots.baseId}-0`, { vote: firstConfig.options?.[0] || "test" });
    }

  } else if (templateName === "claim") {
    const { snapJson, meta } = claim(slots as any);

    const id = slots.id || `claim-${Date.now().toString(36)}`;
    const selfUrl = `${BASE_URL}/${id}`;
    const finalJson = JSON.stringify(snapJson).replace(/\{\{SELF_URL\}\}/g, selfUrl);
    const parsedJson = JSON.parse(finalJson);

    const validation = validateSnapResponse(parsedJson);
    if (!validation.valid) {
      throw new Error(`Claim validation failed: ${JSON.stringify(validation.issues)}`);
    }

    upsertSnap(id, finalJson, { app_name: "claim" });
    setSnapMeta(id, "claim", meta.config);
    deployed.push({ id, url: selfUrl });

    // Smoke test: simulate a POST to verify the handler works
    await smokeTestInteractive(id, {});
  } else if (templateName === "tip-jar") {
    // Client-only — no server handler, no smoke test
    const { snapJson } = tipJar(slots as any);
    const id = slots.id || `tip-${Date.now().toString(36)}`;

    const validation = validateSnapResponse(snapJson);
    if (!validation.valid) {
      throw new Error(`Tip jar validation failed: ${JSON.stringify(validation.issues)}`);
    }

    upsertSnap(id, JSON.stringify(snapJson), { app_name: "tip-jar" });
    deployed.push({ id, url: `${BASE_URL}/${id}` });

  } else if (templateName === "token-buy") {
    // Client-only — no server handler, no smoke test
    const { snapJson } = tokenBuy(slots as any);
    const id = slots.id || `buy-${Date.now().toString(36)}`;

    const validation = validateSnapResponse(snapJson);
    if (!validation.valid) {
      throw new Error(`Token buy validation failed: ${JSON.stringify(validation.issues)}`);
    }

    upsertSnap(id, JSON.stringify(snapJson), { app_name: "token-buy" });
    deployed.push({ id, url: `${BASE_URL}/${id}` });

  } else if (templateName === "token-showcase") {
    // Client-only — no server handler, no smoke test
    const { snapJson } = tokenShowcase(slots as any);
    const id = slots.id || `token-${Date.now().toString(36)}`;

    const validation = validateSnapResponse(snapJson);
    if (!validation.valid) {
      throw new Error(`Token showcase validation failed: ${JSON.stringify(validation.issues)}`);
    }

    upsertSnap(id, JSON.stringify(snapJson), { app_name: "token-showcase" });
    deployed.push({ id, url: `${BASE_URL}/${id}` });

  } else if (templateName === "rating") {
    const { snapJson, meta } = rating(slots as any);

    const id = slots.id || `rating-${Date.now().toString(36)}`;
    const selfUrl = `${BASE_URL}/${id}`;
    const finalJson = JSON.stringify(snapJson).replace(/\{\{SELF_URL\}\}/g, selfUrl);
    const parsedJson = JSON.parse(finalJson);

    const validation = validateSnapResponse(parsedJson);
    if (!validation.valid) {
      throw new Error(`Rating validation failed: ${JSON.stringify(validation.issues)}`);
    }

    upsertSnap(id, finalJson, { app_name: "rating" });
    setSnapMeta(id, "rating", meta.config);
    deployed.push({ id, url: selfUrl });

    // Smoke test: simulate a POST with a rating value
    const min = meta.config.min || 1;
    const max = meta.config.max || 10;
    await smokeTestInteractive(id, { rating: String(Math.ceil((min + max) / 2)) });
  } else if (templateName === "text-entry") {
    const { snapJson, meta } = textEntry(slots as any);

    const id = slots.id || `text-${Date.now().toString(36)}`;
    const selfUrl = `${BASE_URL}/${id}`;
    const finalJson = JSON.stringify(snapJson).replace(/\{\{SELF_URL\}\}/g, selfUrl);
    const parsedJson = JSON.parse(finalJson);

    const validation = validateSnapResponse(parsedJson);
    if (!validation.valid) {
      throw new Error(`Text entry validation failed: ${JSON.stringify(validation.issues)}`);
    }

    upsertSnap(id, finalJson, { app_name: "text-entry" });
    setSnapMeta(id, "text-entry", meta.config);
    deployed.push({ id, url: selfUrl });

    // Smoke test: simulate a POST with test input
    const inputName = meta.config.inputName || "response";
    await smokeTestInteractive(id, { [inputName]: "smoke test response" });
  }

  return { template: templateName, pages: deployed };
}

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

  // Validate snap against @farcaster/snap schema before storing
  const validation = validateSnapResponse(body.json);
  if (!validation.valid) {
    console.error(`[snap] Validation failed for ${body.id || "new"}:`, JSON.stringify(validation.issues));
    return c.json({
      error: "Snap validation failed",
      valid: false,
      issues: validation.issues.map((i: any) => ({
        path: i.path?.join(".") || "root",
        message: i.message,
      })),
    }, 422);
  }

  const id = body.id || crypto.randomUUID().slice(0, 8);
  const snap = upsertSnap(id, JSON.stringify(body.json), {
    app_name: body.app_name,
    cast_hash: body.cast_hash,
  });

  return c.json({ id: snap.id, url: `${BASE_URL}/${snap.id}`, created: snap.created_at, updated: snap.updated_at }, 201);
});

app.delete("/api/snaps/:id", requireAdmin, (c) => {
  const id = c.req.param("id")!;
  if (!deleteSnap(id)) return c.notFound();
  deleteSnapMeta(id);
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Status API — unified tree (before /:id catch-all)
// ---------------------------------------------------------------------------

app.route("/api/status", statusRoutes);

// ---------------------------------------------------------------------------
// Landing page — GET / (must be before /:id catch-all)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Landing page — serve Vite build
// ---------------------------------------------------------------------------

// Serve Vite build assets (JS, CSS, etc.)
app.use("/assets/*", serveStatic({ root: "./web/dist" }));

app.get("/", async (c) => {
  const { readFile } = await import("node:fs/promises");
  const html = await readFile(new URL("../web/dist/index.html", import.meta.url), "utf8");
  return c.html(html);
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
</html>`, 200, {
    "Vary": "Accept",
    "Link": `<${BASE_URL}/${id}>; rel="alternate"; type="application/vnd.farcaster.snap+json"`,
  });
});

// ---------------------------------------------------------------------------
// Snap interaction — POST /:id (JFS verified, with handler routing)
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
  const buttonIndex = payloadData.button_index ?? 0;
  console.log(`[snap] POST /${id} fid=${fid} inputs=${JSON.stringify(inputs)} button=${buttonIndex}`);

  // Try handler routing first (for interactive snaps)
  if (fid) {
    try {
      console.log(`[snap] Dispatching to handler for ${id}`);
      const handlerResult = await handleSnapPost(id, fid, inputs, buttonIndex);
      console.log(`[snap] Handler result for ${id}:`, handlerResult ? "has response" : "null");
      if (handlerResult) {
        return c.json(handlerResult.snapJson, 200, {
          "Content-Type": "application/vnd.farcaster.snap+json",
        });
      }
    } catch (err: any) {
      console.error(`[snap] Handler error for ${id}:`, err);
      // Fall through to default behavior
    }
  }

  // Default behavior: persist state and re-serve snap
  if (fid && Object.keys(inputs).length > 0) {
    setSnapStateBulk(id, fid, inputs);
  }

  const snapJson = JSON.parse(snap.json);
  // Never inject _state — snap v2 spec doesn't support extra top-level keys
  return c.json(snapJson, 200, {
    "Content-Type": "application/vnd.farcaster.snap+json",
  });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

console.log(`[snap-server] Starting on port ${PORT}`);
console.log(`[snap-server] Base URL: ${BASE_URL}`);
console.log(`[snap-server] Admin API: ${ADMIN_KEY ? "protected" : "open (dev mode)"}`);
console.log(`[snap-server] Template engine: ${listTemplates().join(", ")}, poll, quiz, claim`);

serve({ fetch: app.fetch, port: PORT });
