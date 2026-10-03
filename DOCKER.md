# Docker guide — Fairway Live

## Quick start

From the project root (where `docker-compose.yml` lives):

```bash
docker compose up -d --build
```

Open **http://localhost:3000**

That’s it. Postgres and the Next.js app both start; the app applies the Prisma schema on boot.

### GolfCourseAPI key

Uses the **same** `GOLF_COURSE_API_KEY` already in your project `.env`.  
Compose loads `.env` and injects the key into the app container — no need to set it twice.

`DATABASE_URL` in `.env` can stay as `localhost` for local Node development;  
inside Docker it is overridden to `db:5432` automatically.

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
| Host (from host machine) | `localhost:5432` |
| Host (from app container) | `db:5432` |
| User | `postgres` |
| Password | `postgres` |
| Database | `fairway_live` |

## Troubleshooting

**Port 3000 or 5432 already in use**  
Stop the other process, or change the left-hand side of the port mapping in `docker-compose.yml` (e.g. `"3001:3000"`).

**App keeps restarting**  
Check logs: `docker compose logs app`. Usually the DB was not healthy yet or `DATABASE_URL` is wrong.

**Schema changes after pull**  
Rebuild so the image includes the new Prisma schema:

```bash
docker compose up -d --build
```

The entrypoint runs `prisma db push` on every start, so the database updates automatically.
