/**
 * Status aggregator route for snap-server.
 *
 * GET /api/status — returns the unified tree structure:
 *   - response_queue: fetched from relay (port 3001)
 *   - pipeline_queue: fetched from glitch service (port 3002)
 *   - services: snap-server health + pm2 status
 */
import { Hono } from "hono";
declare const status: Hono<import("hono/types").BlankEnv, import("hono/types").BlankSchema, "/">;
export default status;
