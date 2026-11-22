# Docker guide — Fairway Live

## Quick start

From the project root (where `docker-compose.yml` lives):

```bash
cp .env.example .env
# Edit .env before continuing: set POSTGRES_PASSWORD and NEXT_PUBLIC_APP_URL.
docker compose up -d --build
```

Open **http://localhost:3000** for a local deployment. For public deployment, place
the app behind a TLS reverse proxy and set `NEXT_PUBLIC_APP_URL` to that HTTPS URL.

That’s it. Postgres and the Next.js app both start; the app applies the Prisma schema on boot.

### GolfCourseAPI key

Uses the **same** `GOLF_COURSE_API_KEY` already in your project `.env`.  
Compose loads `.env` and injects the key into the app container — no need to set it twice.

`DATABASE_URL` in `.env` is overridden to `db:5432` inside Docker. The database port
is not published to the host; use a separate local PostgreSQL instance or a
development-only Compose override when running the app with `npm run dev`.

### Required environment

| Variable | Purpose |
|----------|---------|
| `POSTGRES_PASSWORD` | Required password for the PostgreSQL container. Use a strong, unique value. |
| `NEXT_PUBLIC_APP_URL` | Required public HTTPS URL for deployed environments. |
| `GOLF_COURSE_API_KEY` | Optional server-only key for course search and import. |
| `ALLOW_GUEST_HOSTS` | Optional. Defaults to `true` in Compose; set `false` to require email-only host access. |

### Guest hosts

Quick start creates a temporary host account from a display name and sets a host
session cookie. It is enabled by default in the supplied Compose configuration. If
your public deployment requires a verified host identity, set
`ALLOW_GUEST_HOSTS=false` and use the email-link flow instead.

## What’s included

| File | Purpose |
|------|---------|
| `Dockerfile` | Multi-stage build of the Next.js app |
| `docker-compose.yml` | `db` (Postgres 16) + `app` services |
| `docker/entrypoint.sh` | Waits for DB, runs `prisma db push`, starts the app |
| `.dockerignore` | Keeps the image build lean |

## Commands

```bash
docker compose up -d --build   # build & start
docker compose ps              # status
docker compose logs -f app     # follow app logs
docker compose down            # stop containers
docker compose down -v         # stop and wipe the database volume
```

## Database defaults

| Setting | Value |
|---------|--------|
| Host (from host machine) | Not published |
| Host (from app container) | `db:5432` |
| User | `postgres` |
| Password | Value of `POSTGRES_PASSWORD` |
| Database | `fairway_live` |

## Troubleshooting

**Port 3000 already in use**
Stop the other process, or change the left-hand side of the app port mapping in
`docker-compose.yml` (for example, `"3001:3000"`).

**App keeps restarting**  
Check logs: `docker compose logs app`. Usually the DB was not healthy yet or `DATABASE_URL` is wrong.

**Schema changes after pull**  
Rebuild so the image includes the new Prisma schema:

```bash
docker compose up -d --build
```

The entrypoint runs `prisma migrate deploy` on every start, so only reviewed, checked-in
migrations are applied. It will not use `db push` or accept destructive schema changes.

### Existing database baseline

This release introduces the first checked-in migration. If a database was created by an
earlier version using `prisma db push`, take a backup and mark the baseline as applied
once before deploying this image:

```sh
npx prisma migrate resolve --applied 20261122120000_initial_schema
```

Run this only after confirming the existing database matches `prisma/schema.prisma`.
