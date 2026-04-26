/**
 * Status aggregator route for snap-server.
 *
 * GET /api/status — returns the unified tree structure:
 *   - response_queue: fetched from relay (port 3001)
 *   - pipeline_queue: fetched from glitch service (port 3002)
 *   - services: snap-server health + pm2 status
 */

import { Hono } from "hono";

const RELAY_URL = process.env.RELAY_URL || "http://localhost:3001";
const GLITCH_URL = process.env.GLITCH_URL || "http://localhost:3002";

const status = new Hono();

async function fetchJSON(url: string, fallback: any, timeoutMs = 3000): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return fallback;
    return await res.json();
  } catch {
    clearTimeout(timer);
    return { ...fallback, _error: "unreachable" };
  }
}

status.get("/", async (c) => {
  const [relayHealth, glitchHealth, pipelineStatus, relayQueueStatus] = await Promise.all([
    fetchJSON(`${RELAY_URL}/health`, null),
    fetchJSON(`${GLITCH_URL}/health`, null),
    fetchJSON(`${GLITCH_URL}/queue`, { pending: 0, processing: null, queue: [], queueLength: 0, isProcessing: false }),
    fetchJSON(`${RELAY_URL}/api/response-queue/status`, { status: "idle", current: null, pending: [], pending_count: 0, recent: [], stats: { total_processed: 0, total_failed: 0, error_rate: "0" } }),
  ]);

  // Snap-server own stats
  const snapCount = c.get("snapCount") as number || 0;

  const tree = {
    suchbot: {
      timestamp: new Date().toISOString(),
      response_queue: {
        ...relayQueueStatus,
        _service: relayHealth ? "ok" : "down",
      },
      pipeline_queue: {
        status: pipelineStatus.isProcessing ? "processing" : "idle",
        current: pipelineStatus.processing
          ? {
              id: pipelineStatus.processing.id,
              cast_hash: pipelineStatus.processing.castHash,
              effect: pipelineStatus.processing.effect,
              author: pipelineStatus.processing.authorUsername,
              started_at: pipelineStatus.processing.createdAt,
            }
          : null,
        pending: pipelineStatus.queue || [],
        pending_count: pipelineStatus.queueLength || 0,
      },
      services: {
        snap_server: {
          status: "ok",
          uptime: Math.round(process.uptime()),
          snap_count: snapCount,
        },
        relay: {
          status: relayHealth ? "ok" : "down",
          version: relayHealth?.version || null,
        },
        glitch: {
          status: glitchHealth ? "ok" : "down",
          version: glitchHealth?.version || null,
        },
      },
    },
  };

  return c.json(tree);
});

export default status;
