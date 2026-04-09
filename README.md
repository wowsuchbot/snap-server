# Snap Server

Self-hosted snap renderer — stores snap JSON in SQLite and serves it to Farcaster clients via content negotiation.

## How it works

- **Admin API** (`/api/snaps`) — create, read, update, delete snaps
- **Snap serving** (`GET /:id`) — returns snap JSON when the client sends `Accept: application/vnd.farcaster.snap+json`, otherwise returns an HTML fallback with OG tags
- **Snap interaction** (`POST /:id`) — handles button taps with JFS signature verification
- **Per-FID state** — persists user inputs across interactions in SQLite

## Run locally

```bash
pnpm install
SKIP_JFS_VERIFICATION=true pnpm dev
```

Test:

```bash
# Create a snap
curl -sS -X POST http://localhost:3101/api/snaps \
  -H "Content-Type: application/json" \
  -d '{"id":"test","json":{"version":"1.0","theme":{"accent":"purple"},"ui":{"root":"page","elements":{"page":{"type":"stack","props":{},"children":["title"]},"title":{"type":"text","props":{"content":"Hello","weight":"bold"}}}}}}'

# Fetch snap JSON
curl -sS -H "Accept: application/vnd.farcaster.snap+json" http://localhost:3101/test

# HTML fallback (no Accept header)
curl -sS http://localhost:3101/test
```

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3101` | Listen port |
| `SNAP_PUBLIC_BASE_URL` | `http://localhost:3101` | Public base URL for OG tags and API responses |
| `SNAP_DB_PATH` | `./data/snaps.db` | SQLite database path |
| `SNAP_ADMIN_KEY` | *(none)* | Bearer token for admin API (open if unset) |
| `SKIP_JFS_VERIFICATION` | `false` | Skip JFS signature verification on POST (dev only) |

## Deploy

Behind Caddy or any reverse proxy with TLS. The snap server needs a public HTTPS URL for Farcaster clients to fetch snap JSON.
