# Fairway Live

Live golf scoring for casual groups and societies. Hosts set up a round from real course data, players join with a short code, enter hole scores on mobile, and everyone watches a live Stableford leaderboard. Finished rounds export to Excel.

## Stack

Matches the product implementation plan:

| Layer | Technology |
|-------|------------|
| App | **Next.js 15.1.9** (App Router) + **TypeScript** — patched for CVE-2025-66478 |
| Validation | **Zod** |
| Database | **PostgreSQL** via **Prisma** |
| Auth | Email magic-link (hosts) + join-code guest sessions (players) |
| Unit tests | **Vitest** |
| Excel export | **ExcelJS** |
| Styling | **Tailwind CSS** |
| Course data | GolfCourseAPI (server-side proxy) |

The previous vanilla JS / localStorage prototype is preserved under `_legacy_prototype/` for reference.

## Prerequisites

- Node.js 20+
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (recommended for PostgreSQL on Windows)
- (Optional) [GolfCourseAPI](https://api.golfcourseapi.com) key for course import

## Run with Docker (recommended)

One command starts the app **and** PostgreSQL:

```bash
# Optional: put your GolfCourseAPI key in a .env file
# GOLF_COURSE_API_KEY=your_key_here

docker compose up -d --build
```

Then open **http://localhost:3000**

| Service | URL / port |
|---------|------------|
| Fairway Live | http://localhost:3000 |
| PostgreSQL | localhost:5432 (user/pass/db: `postgres` / `postgres` / `fairway_live`) |

Useful commands:

```bash
docker compose logs -f app    # app logs
docker compose logs -f db     # database logs
docker compose down           # stop
docker compose down -v        # stop and delete database volume
docker compose up -d --build  # rebuild after code changes
```

On first start the container runs `prisma db push` automatically so the schema is created.

---

## Local development (without full Docker app)

## Setup (Node + Docker DB only)

### 1. Start PostgreSQL in Docker

```bash
docker compose up -d
```

This starts Postgres 16 on `localhost:5432` with:

| Setting | Value |
|---------|--------|
| User | `postgres` |
| Password | `postgres` |
| Database | `fairway_live` |

### 2. Configure environment

```bash
cp .env.example .env
```

Default `DATABASE_URL` already targets the Docker container:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/fairway_live?schema=public"
```

If your Docker Postgres uses different credentials or port, change `DATABASE_URL` to match.

### 3. Install, generate Prisma client, push schema

```bash
npm install
npx prisma generate
npx prisma db push
```

`npm install` also runs `prisma generate` via `postinstall`.

### 4. Run the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL URL (default matches `docker-compose.yml`) |
| `GOLF_COURSE_API_KEY` | No | Bearer token for GolfCourseAPI (server-only) |
| `NEXT_PUBLIC_APP_URL` | No | Public app URL for magic-link emails (default `http://localhost:3000`) |

### Database scripts

| Command | Purpose |
|---------|---------|
| `npm run db:up` | Start Postgres (`docker compose up -d`) |
| `npm run db:down` | Stop the Postgres container |
| `npm run db:generate` | `prisma generate` |
| `npm run db:push` | Push schema to the database |
| `npm run db:studio` | Open Prisma Studio |

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and serve |
| `npm test` | Vitest unit tests (scoring engine) |
| `npm run test:watch` | Vitest in watch mode |
| `npm run typecheck` | TypeScript check (`tsc --noEmit`) |
| `npm run lint` | ESLint |
| `npm run db:generate` | Generate Prisma client |
| `npm run db:push` | Push schema to PostgreSQL |
| `npm run db:migrate` | Create/apply migrations |
| `npm run db:studio` | Open Prisma Studio |

## Project layout

```
golf live scores app/
├── prisma/
│   └── schema.prisma          # PostgreSQL data model
├── src/
│   ├── app/                   # Next.js App Router
│   │   ├── page.tsx           # Landing page
│   │   ├── layout.tsx
│   │   ├── globals.css
│   │   ├── sign-in/page.tsx   # Host magic-link sign-in
│   │   ├── join/page.tsx      # Player join form
│   │   ├── dashboard/page.tsx # Host or player dashboard
│   │   └── api/
│   │       ├── auth/
│   │       │   ├── magic-link/route.ts
│   │       │   ├── verify/route.ts
│   │       │   └── session/route.ts
│   │       ├── rounds/
│   │       │   ├── route.ts              # GET list / POST create
│   │       │   ├── join/route.ts
│   │       │   └── [id]/
│   │       │       ├── scores/route.ts
│   │       │       ├── leaderboard/route.ts
│   │       │       └── export/route.ts
│   │       └── golf/
│   │           └── courses/route.ts      # GolfCourseAPI proxy
│   ├── domain/
│   │   ├── scoring.ts         # Pure handicap + Stableford engine
│   │   └── scoring.test.ts
│   ├── lib/
│   │   ├── auth.ts            # Session cookies, magic-link, join codes
│   │   ├── db.ts              # Prisma client singleton
│   │   ├── export.ts          # ExcelJS workbook generation
│   │   └── types.ts           # Zod schemas & shared types
│   └── components/            # (shared UI components as they grow)
├── docs/                      # Product design, implementation plan, tasks
├── _legacy_prototype/         # Previous vanilla JS implementation
├── vitest.config.ts
├── next.config.ts
├── tailwind.config.ts
├── package.json
├── ARCHITECTURE.md
└── .env.example
```

## API overview

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/auth/magic-link` | Request host magic link (returns `devToken` in development) |
| `POST` | `/api/auth/verify` | Consume magic-link token → host session cookie |
| `GET` | `/api/auth/session` | Current session |
| `DELETE` | `/api/auth/session` | Sign out |
| `GET` | `/api/rounds` | List host’s rounds |
| `POST` | `/api/rounds` | Create round (frozen tee snapshot + join code) |
| `POST` | `/api/rounds/join` | Player join with code, name, handicap |
| `PUT` | `/api/rounds/[id]/scores` | Save/correct a hole score |
| `GET` | `/api/rounds/[id]/leaderboard` | Ranked Stableford leaderboard |
| `POST` | `/api/rounds/[id]/export` | Download `.xlsx` (host, ready_for_export/closed) |
| `GET` | `/api/golf/courses` | Search courses via GolfCourseAPI proxy |

## Domain rules (invariants)

- **Handicap strokes:** `floor(hcp / 18)` on every hole, plus 1 on holes with stroke index ≤ `hcp % 18`
- **Stableford:** `max(0, 2 + par - netScore)` where `netScore = gross - handicapStrokes`
- **Frozen tee snapshot:** Round stores course/tee hole data at creation; catalog edits cannot change results
- **Gross is source of truth:** Points are always derived, never stored independently
- **Closed rounds** reject score writes
- **Display names** unique within a round (case-insensitive)
- **Playing handicap** is a whole number 0–54 for the round

## Development auth

In non-production, `POST /api/auth/magic-link` returns a `devToken`. Use **Open demo magic link** on the sign-in page (or `POST /api/auth/verify` with that token) to establish a host session without email.

## Docs

| Document | Path |
|----------|------|
| Architecture | [ARCHITECTURE.md](./ARCHITECTURE.md) |
| Product design | [docs/golf-live-leaderboard/design.md](./docs/golf-live-leaderboard/design.md) |
| Implementation plan | [docs/golf-live-leaderboard/implementation-plan.md](./docs/golf-live-leaderboard/implementation-plan.md) |
| Course data source | [docs/golf-live-leaderboard/course-data-source.md](./docs/golf-live-leaderboard/course-data-source.md) |
| Task tracker | [docs/golf-live-leaderboard/tasks/README.md](./docs/golf-live-leaderboard/tasks/README.md) |
