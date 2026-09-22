# PrintSetu — Production Deployment

Nginx runs as a Docker Compose service in front of the containerized
Angular frontend and NestJS backend. This does **not** change local
development — `docker compose up` (infra only) + `npm start` in
`printsetu-backend`/`printsetu-frontend` still works exactly as before.

## Architecture

```
Browser
  │
  ▼
Nginx :80 (:443 once TLS is added)   — infra/nginx/nginx.conf
  ├── /                       → frontend container (static Angular build, its own nginx)
  ├── /api/                   → backend container :3000 (NestJS)
  ├── /socket.io/             → backend container :3000 (Print Agent WebSocket)
  └── /printsetu-documents/   → minio container :9000 (presigned document URLs)

Print Agent (runs on the shopkeeper's own PC, NOT in Docker)
  └── wss://<domain>/  → same Nginx → backend :3000
```

Fully internal, no host port published at all: Postgres, Redis, Keycloak,
document-analysis (FastAPI), and now MinIO's S3 API too — Nginx reverse
proxies the one MinIO path the browser needs instead. See "Why does
Nginx proxy MinIO?" below.

## Files

| File | Purpose |
|---|---|
| `docker-compose.yml` | Unchanged — infra services for local dev (Postgres, Redis, MinIO, Keycloak). |
| `docker-compose.prod.yml` | Production overlay: adds `backend`, `frontend`, `document-analysis`, `nginx`; binds Postgres/Redis/Keycloak/MinIO-console to `127.0.0.1` only and drops MinIO's API port entirely (uses `!override`, not plain `ports:` — see the comment in the file for why that matters). Always used together with the base file. |
| `infra/nginx/nginx.conf` | The reverse proxy config. |
| `printsetu-frontend/Dockerfile` | Multi-stage build: `node:20-alpine` builds the Angular app, `nginx:1.27-alpine` serves the static output. No `node_modules` in the final image. |
| `printsetu-frontend/nginx.frontend.conf` | Static file serving + SPA fallback (`try_files ... /index.html`) for the frontend container. |
| `printsetu-backend/.env.production.example` | Template for backend production env vars. Copy to `printsetu-backend/.env.production`, fill in real values, never commit it (gitignored). |

## Build and run

```bash
# 1. Create the production env file (once) and fill in real secrets/domain
cp printsetu-backend/.env.production.example printsetu-backend/.env.production
$EDITOR printsetu-backend/.env.production

# 2. Set the infra service passwords used by docker-compose.yml itself
#    (POSTGRES_PASSWORD, S3_ACCESS_KEY_ID/SECRET, KC_BOOTSTRAP_ADMIN_*, etc.)
#    — either export them in the shell or put them in a root .env file,
#    matching the values you used in .env.production.
$EDITOR .env

# 3. Build and start everything
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# 4. Apply database migrations, then seed the demo Role/Shop/User rows
#    that match keycloak/printsetu-realm.json's demo accounts. Without
#    this step, login succeeds (Keycloak has no idea about the app's own
#    DB) but every API call 401s, because KeycloakAuthGuard can't find a
#    matching `users` row for the token's subject. The prod image prunes
#    ts-node/the prisma CLI to stay lean, so install them into a
#    throwaway container rather than the long-running one:
docker run --rm \
  --network printsetu_default \
  --env-file printsetu-backend/.env.production \
  --entrypoint sh \
  printsetu-backend \
  -c "npm install --no-save prisma@^5.20.0 ts-node@^10.9.2 typescript@^5.6.2 && npx prisma migrate deploy && npx prisma db seed"

# 5. Watch logs / check status
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
```

### Validate config without starting anything

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml config --quiet
docker compose -f docker-compose.yml -f docker-compose.prod.yml build
```

### Stop / restart

```bash
# Stop (keeps volumes: Postgres data, MinIO data, etc.)
docker compose -f docker-compose.yml -f docker-compose.prod.yml down

# Restart a single service after a code change, e.g. backend
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build backend

# Full restart
docker compose -f docker-compose.yml -f docker-compose.prod.yml restart
```

## Ports exposed on the host

| Port | Service | Public? |
|---|---|---|
| 80 | Nginx (HTTP) | Yes — this is the app |
| 443 | Nginx (HTTPS, once configured) | Yes |
| 59001 (`MINIO_CONSOLE_PORT`) | MinIO admin console | No, `127.0.0.1` only |
| 55432, 56379, 58080 | Postgres, Redis, Keycloak | No, `127.0.0.1` only (SSH-tunnel for admin access) |
| — | MinIO S3 API (9000), backend (3000), frontend (80), document-analysis (8000) | No — internal Docker network only, reached by Nginx/backend via service name |

### Why does Nginx proxy MinIO?

The backend hands the **browser** presigned MinIO URLs directly for
document preview/download (`printsetu-backend/src/storage/s3-storage.service.ts`).
Rather than publish MinIO's API port on the host for that (the earlier
approach), Nginx now reverse proxies it internally — see the
`/printsetu-documents/` location in `infra/nginx/nginx.conf`. MinIO's S3
signature check requires the `Host` header and path it sees to exactly
match what the backend signed against, so that location forwards the
request completely unchanged (no path rewriting, no Host override) —
that's also why `S3_ENDPOINT` in `.env.production` is the plain public
host with **no port** (`http://18.213.215.175`, not `:59000`): the SDK
builds and signs URLs against that same origin, matching what Nginx
receives from the browser and passes straight through. Same endpoint is
also what the backend itself uses for its own uploads/reads (one shared
S3 client — see the comment in `.env.production.example`), so the bucket
name baked into that Nginx location (`printsetu-documents`) must be kept
in sync with `S3_BUCKET` if you ever change it. The MinIO **console**
(port 9001) is purely an admin UI the app never calls, so that one stays
loopback-only rather than proxied.

## Routing

- `/` → `frontend` container (static Angular build)
- `/api/*` → `backend` container on port 3000 (NestJS, global prefix `/api`)
- `/socket.io/*` → `backend` container on port 3000 (Print Agent WebSocket;
  socket.io always uses this path regardless of the `/agent` namespace)
- `/printsetu-documents/*` → `minio` container on port 9000 (presigned
  document preview/download URLs; forwarded unchanged, see above)
- Everything else (Postgres/Redis/Keycloak/document-analysis) is **not**
  routed by Nginx — internal Docker network only.

Nginx forwards `Host`, `X-Real-IP`, `X-Forwarded-For` and
`X-Forwarded-Proto` on every proxied request. `client_max_body_size` is
30m (matches `MAX_UPLOAD_SIZE_BYTES=26214400` in the backend with
headroom for multipart overhead); `proxy_read_timeout`/`proxy_send_timeout`
are 120s for normal requests and 3600s for the WebSocket location, so a
long-lived Print Agent connection isn't dropped for being idle.

## Adding HTTPS

1. Get a certificate for your domain (e.g. `certbot certonly --standalone`
   run once on the host, or any other ACME client) — `fullchain.pem` and
   `privkey.pem`.
2. Put them under `infra/nginx/certs/` on the host (gitignored — never
   commit certs/keys).
3. In `docker-compose.prod.yml`, uncomment the certs volume mount on the
   `nginx` service.
4. In `infra/nginx/nginx.conf`, uncomment the `server { listen 443 ssl; ... }`
   block (and its certificate paths), and optionally the plain-HTTP →
   HTTPS redirect block below it.
5. Update `printsetu-backend/.env.production`: switch
   `AGENT_BACKEND_WS_URL` to `wss://...`, `AGENT_BACKEND_HTTP_URL` and
   `PUBLIC_APP_BASE_URL` to `https://...`.
6. Rebuild the Print Agent download bundle (if you serve one) so newly
   downloaded agents pick up the new URLs; already-installed agents keep
   using whatever they were configured with until reconfigured.
7. `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d nginx`

## Assumptions / known limitations

- **MinIO reachability from the backend itself**: since `S3_ENDPOINT` is
  now the public Elastic IP (so browser-facing presigned URLs resolve),
  the backend's *own* upload/read calls to MinIO also go out via that
  same public IP and back in through Nginx (the instance essentially
  calling itself) rather than a direct container-to-container hop. AWS
  generally supports this "hairpin" routing back to an instance's own
  Elastic IP, but if you see `S3_ENDPOINT`/connectivity errors from the
  backend specifically (not from the browser), that's the first thing to
  check — confirm the EC2 instance can reach its own Elastic IP on port
  80.
- **document-analysis** wasn't previously wired into `docker-compose.yml`
  at all (it's run manually via its local `.venv` in dev). It's added
  here as an internal-only Compose service using its existing,
  unmodified `Dockerfile` — required for the backend to reach it inside
  Docker's network; not touched or proxied by Nginx.
- **Keycloak** runs in `start-dev` mode (from the existing, unmodified
  `docker-compose.yml`) — fine for this deployment since it's never
  exposed publicly, but worth revisiting if Keycloak itself is ever
  meant to be internet-facing later.
- **Print Agent bundle**: the backend's "Download Print Agent" feature
  reads a pre-built bundle from disk
  (`PRINT_AGENT_BUNDLE_DIR`). Building that bundle (`npm run build:exe`
  in `printsetu-print-agent`) needs Windows tooling and isn't part of
  this Docker setup — mount the built `release/bundle` folder into the
  backend container (see the commented volume in
  `docker-compose.prod.yml`) if you need that feature in production.
- **Disk budget**: a 6.7 GB root disk is tight. After the initial
  `--build`, run `docker builder prune` and `docker image prune` to drop
  intermediate build layers you don't need at runtime.
