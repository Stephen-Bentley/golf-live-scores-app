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
| `FAIRWAY_HOST_PORT` | Optional host port. Defaults to `3000`. The container listens on port `3000`. |
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
| `docker/entrypoint.sh` | Applies pending Prisma migrations, then starts Next.js |
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

### Use port 3001

Run this PowerShell command from the project folder after configuring the database password.

```powershell
$env:FAIRWAY_HOST_PORT='3001'; $env:NEXT_PUBLIC_APP_URL='http://localhost:3001'; docker compose up -d --build
```

Open [http://localhost:3001](http://localhost:3001).

**App keeps restarting**  
Check logs: `docker compose logs app`. Usually the DB was not healthy yet or `DATABASE_URL` is wrong.

**Schema changes after pull**  
Rebuild so the image includes the new Prisma schema:

```bash
docker compose up -d --build
```

The entrypoint runs `prisma migrate deploy` on every start to apply the checked-in migrations.

### Existing database baseline

If startup reports `P3005` for a database originally created with `prisma db push`, back it up and compare it against the schema represented by the initial migration. With PostgreSQL running and the app image built, run this read-only check from PowerShell.

```powershell
git show 0df5d6e:prisma/schema.prisma | docker compose run --rm -T --no-deps --entrypoint sh app -c 'cat > /tmp/fairway-baseline.prisma && npx prisma migrate diff --from-schema-datasource /tmp/fairway-baseline.prisma --to-schema-datamodel /tmp/fairway-baseline.prisma --exit-code'
```

If the output says **No difference detected**, record the initial migration and restart the app. Startup applies the remaining migrations, including `20261123120000_add_fourballs`. If the check shows a difference, inspect it before recording a baseline.

```powershell
docker compose stop app; if ($LASTEXITCODE -eq 0) { docker compose run --rm -T --no-deps --entrypoint npx app prisma migrate resolve --applied 20261122120000_initial_schema; if ($LASTEXITCODE -eq 0) { docker compose up -d --no-deps --no-build app } }
```
