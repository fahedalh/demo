# Deployment

## Option A — Docker Compose (single host)

```bash
cp .env.example .env            # set JWT secrets (openssl rand -hex 48), POSTGRES_PASSWORD, provider keys
docker compose up -d --build    # postgres, redis, api (runs migrate deploy on start), web (nginx)
docker compose run --rm seed    # optional: demo data
```

| Service | Port | Notes |
|---|---|---|
| web | 8080 passenger · 8081 driver · 8082 admin | nginx serves the static builds and proxies `/api` + `/socket.io` to the API (same-origin, WebSocket upgrade, long-cache `/assets`) |
| api | 4000 (localhost only) | non-root user, health check `/api/health`, documents on the `documents` volume |
| postgres / redis | internal | named volumes `pgdata`, `redisdata` (AOF on) |

Put a TLS-terminating proxy (Caddy, Traefik, a cloud load balancer) in front and map hostnames, e.g. `app.example.com → :8080`, `drive.example.com → :8081`, `admin.example.com → :8082` (restrict the admin host by IP/VPN/SSO). Add every public origin to `CORS_ORIGINS`.

## Option B — managed cloud

* **API**: any container platform (ECS/Fargate, Cloud Run with min instances ≥ 1 and session affinity for WebSockets, Fly.io, Kubernetes). Run `prisma migrate deploy` as a release step. For more than one instance set `SOCKET_REDIS_ADAPTER=true` and enable sticky sessions (or WebSocket-only transport).
* **Postgres**: managed (RDS/Aurora, Cloud SQL, Neon) with PITR backups.
* **Redis**: managed (ElastiCache, Memorystore, Upstash).
* **Web apps**: static hosting/CDN (S3+CloudFront, Vercel, Netlify) with SPA fallback; route `/api` and `/socket.io` to the API (or set `VITE_API_URL` to the API origin and configure CORS + `SameSite=None; Secure` cookies).
* **Documents**: replace `services/storage.ts` with S3/GCS (private bucket, signed URLs, SSE-KMS).

## Production checklist

- [ ] `NODE_ENV=production` (the API refuses placeholder JWT secrets)
- [ ] Strong `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`, rotated via your secret manager
- [ ] `PAYMENT_PROVIDER=stripe` with live keys; webhook endpoint `https://<api>/api/webhooks/payments` subscribed to `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`
- [ ] Map provider key (`GEO_PROVIDER=mapbox|google`) and a production tile source
- [ ] OTP delivery adapter (SMS/email) instead of `console`
- [ ] HTTPS everywhere; admin console behind SSO/VPN
- [ ] Postgres PITR backups + restore drill; storage bucket versioning
- [ ] Log shipping (pino JSON → Loki/Datadog/CloudWatch) and alerts on 5xx rate, `/api/health`, dispatch failures, payment failures
- [ ] Uptime checks on the three web apps and the API health endpoint

## Logging & monitoring

The API logs structured JSON (pino) with request logging and redaction of auth headers, cookies, passwords and tokens. `GET /api/health` reports DB and Redis status (503 when degraded) and is used by the container health check. Recommended dashboards: request rate/latency/5xx, active rides by status, online drivers, dispatch outcomes (accepted / expired / no driver), payment success rate, webhook failures.
