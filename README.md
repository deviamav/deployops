# DeployOps

> **CV theme:** Infrastructure & Deployment Automation  
> **Repo:** [deviamav/deployops](https://github.com/deviamav/deployops)

**Multi-market static website operations & SSH deploy console.**

DeployOps is an operations panel for agencies and teams that run many regional
static sites. It keeps an inventory of VPS servers (SSH), domains, markets,
site templates (ZIP), content packs (ZIP) and entry scripts (PHP/HTML gateways),
and ships them to a server with a 6-step deploy wizard that streams live logs
over Server-Sent Events. Access is controlled by RBAC (`admin` / `team_lead` /
`operator`), every mutating action lands in an audit log, and any deployment can
be rolled back.

## Features

- **Server inventory** — SSH hosts with AES-256-GCM encrypted credentials, bulk import, connection test, remote file browser.
- **Domains** — per-domain web root, server preset and deploy mode; bulk import and bulk operations.
- **Markets** — regions (code, name, flag). The list is **empty by default**; admins add the markets they operate in.
- **Templates** — site templates uploaded as ZIP, with in-browser file tree, editor and sandboxed preview.
- **Content Packs** — content bundles uploaded as ZIP, scoped to a market and (optionally) a team group.
- **Entry Scripts** — PHP/HTML gateway scripts per market (admin only).
- **Deploy wizard** — Domain → Market → Template → Content Pack → Entry Script → Run Deploy, with batch mode and a live log.
- **Rollback** — restores the original site entry file and removes deployed folders.
- **RBAC + audit** — roles, groups, per-user asset permissions, full audit trail (who / when / what / IP).

## Stack

- **Next.js** (App Router, Turbopack) · **React 19** · **TypeScript**
- **Tailwind CSS** · **shadcn/ui** · **lucide-react** · **recharts**
- **Prisma 5** · **PostgreSQL 16**
- **Auth.js (NextAuth v5)** credentials · **bcryptjs**
- **node-ssh** (ssh2) · **adm-zip** (zip-bomb protection)
- **Server-Sent Events** for live deploy logs
- **vitest** for unit tests

## Local setup

```bash
# 1) Dependencies
pnpm install

# 2) Environment
cp .env.example .env
# fill in:
#   DEPLOYOPS_SECRET_KEY  — encryption key for SSH credentials:
#     node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
#   NEXTAUTH_SECRET / AUTH_SECRET — same command
#   SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD — first admin account
#   POSTGRES_PASSWORD — database password (must match DATABASE_URL)

# 3) PostgreSQL + pgAdmin (Docker)
pnpm docker:up
#  PostgreSQL: 127.0.0.1:5433  (user deployops / db deployops)
#  pgAdmin:    http://localhost:5050

# 4) Migrations + seed (admin user + built-in server presets; no markets)
pnpm prisma migrate dev
pnpm db:seed

# 5) Dev server
pnpm dev   # http://localhost:3000
```

### First steps in the UI

1. `/admin/groups` — create a group.
2. `/admin/users` — create team leads and operators.
3. `/admin/geos` — add the markets you operate in.
4. `/admin/scripts` — upload entry scripts (at least one default per market).
5. `/templates` and `/packs` — upload ZIPs (choose market, group or public).
6. `/servers` → **Bulk import** (format `<IP>\t<password>\t<domain1> <domain2>…`).
7. `/domains` → **Bulk import** (one domain per line) or add domains one by one.
8. `/deploy` — run the 6-step wizard.

## Production

```bash
pnpm build && pnpm start
```

Run behind an nginx proxy with HTTPS. Enable the `app` service in
`docker/docker-compose.yml` and mount a dedicated volume for `uploads/`
(especially `uploads/cloakers/`, which stores entry scripts and must be treated as secret).

## Tests

```bash
pnpm test          # vitest run (transformers + parsers + zip paths)
pnpm typecheck     # tsc --noEmit
pnpm lint
```

## Project layout

- `src/app/*` — Next.js App Router (UI + API routes)
- `src/components/*` — UI components (shadcn + shared)
- `src/lib/*` — Prisma client, crypto, ssh, zip, rbac, audit, parsers
- `src/server/deploy/*` — the deploy engine: `transformers.ts` (pure file transforms),
  `engine.ts` (SSH operations), `runner.ts` (async pipeline),
  `rollback-runner.ts` (rollback jobs), `jobs.ts` (pub/sub for SSE)
- `prisma/*` — schema, migrations, seed
- `docker/*` — `docker-compose.yml` for PostgreSQL + pgAdmin
- `tests/*` — vitest

> Naming note: a few internal database/model identifiers (`CloakJob`, `Landing`,
> `Offer`, `CloakerScript`, enum value `buyer`) predate the DeployOps terminology
> and are kept for migration compatibility. In the UI they appear as Deploy
> Jobs, Templates, Content Packs, Entry Scripts and the `operator` role.

## Security

- AES-256-GCM encryption of SSH passwords in the database (`DEPLOYOPS_SECRET_KEY`).
- bcrypt (cost 12) for user passwords.
- Middleware blocks `/admin/*` and `/api/admin/*` for non-admins.
- Every API route uses `requireRole(...)` + `visibilityWhere(user)`.
- Rate limit on `POST /api/deploy`: 5 req/min per user (token bucket).
- Zip-bomb protection: `ZIP_MAX_ENTRIES`, `ZIP_MAX_TOTAL_BYTES`.
- All mutating actions are written to `AuditEvent`.
- HTTP → HTTPS redirect in production middleware.

## Out of scope (v1)

- Control-panel integrations (e.g. hosting panels)
- Scheduled template sync
- A/B template variants
- Chat-bot interface
- Multi-factor authentication
- CSV export of deploy logs
