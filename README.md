# Fairway Live

Live golf scoring for casual groups and societies. Hosts create nine- or 18-hole rounds, assign players to fourballs, and share a join code or private player links. Players can enter their own scores or mark the fourball. Live individual and competition standings export to Excel.

## Stack

Matches the product implementation plan:

| Layer | Technology |
|-------|------------|
| App | **Next.js 15.5.29** (App Router) + **TypeScript** |
| Validation | **Zod** |
| Database | **PostgreSQL** via **Prisma** |
| Auth | Quick-start guest hosts or email magic-link hosts + join-code guest sessions (players) |
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

Create a `.env` file first. Start from the example, set a strong database password,
and set the public HTTPS URL used for deployment:

```bash
cp .env.example .env
# Edit .env: set POSTGRES_PASSWORD and NEXT_PUBLIC_APP_URL.
# GOLF_COURSE_API_KEY is optional.

docker compose up -d --build
```

For a local deployment, open **http://localhost:3000**. Public deployments must
sit behind a TLS reverse proxy and use an `https://` value for `NEXT_PUBLIC_APP_URL`.

| Service | URL / port |
|---------|------------|
| Fairway Live | `http://localhost:3000` locally; HTTPS URL in public deployments |
| PostgreSQL | Internal Docker service only (`db:5432`) |

Useful commands:

```bash
docker compose logs -f app    # app logs
docker compose logs -f db     # database logs
docker compose down           # stop
docker compose down -v        # stop and delete database volume
docker compose up -d --build  # rebuild after code changes
```

The container runs `prisma migrate deploy` before starting Next.js. See the [Docker guide](./DOCKER.md) for using port 3001 or baselining a database created before the checked-in migrations.

## Run a round

1. Choose the course, tees, hole count, and scoring format under **Create a round**.
2. Use **Fourballs** on the leaderboard to add playing groups, set a starting hole, and assign up to four players per group. For Betterball events, create and assign the competition pairs separately.
3. Share the public join code or a private player link. Players can select **My score** or **Score fourball** from score entry.
4. For a Mystery Betterball Alliance round, draw the alliances after the pairs are ready. Mark the round **Ready for export** to download the Excel workbook.

See [Features](./FEATURES.md) for the competition rules and worked verification results.

---

## Local development

Run the full Docker stack above for the closest production setup. To run the Next.js
app directly with `npm run dev`, provide a PostgreSQL instance reachable from your
machine and set `DATABASE_URL` in `.env` to match it.

### 1. Start PostgreSQL

```bash
docker compose up -d db
```

The production Compose file intentionally does not publish the database port. For
direct local development, use a local PostgreSQL installation or a development-only
Compose override that publishes `5432`; do not expose the database on a public host.

Configure the local database with:

| Setting | Value |
|---------|--------|
| User | `postgres` |
| Password | Value of `POSTGRES_PASSWORD` |
| Database | `fairway_live` |

### 2. Configure environment

```bash
cp .env.example .env
```

For direct development, set `DATABASE_URL` to the PostgreSQL instance reachable
from your machine:

```env
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/fairway_live?schema=public"
```

Replace `YOUR_PASSWORD` with the password for the PostgreSQL instance you are using.

### 3. Install dependencies and apply migrations

```bash
npm install
npx prisma generate
npx prisma migrate deploy
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
| `DATABASE_URL` | Yes | PostgreSQL URL reachable from the process running Next.js |
| `POSTGRES_PASSWORD` | Docker only | Required password for the PostgreSQL container |
| `GOLF_COURSE_API_KEY` | No | Bearer token for GolfCourseAPI (server-only) |
| `NEXT_PUBLIC_APP_URL` | Docker/public deployment | Public HTTPS app URL used for magic-link emails |
| `FAIRWAY_HOST_PORT` | No | Docker host port. Defaults to `3000`. Match the port in `NEXT_PUBLIC_APP_URL` for local use. |
| `ALLOW_GUEST_HOSTS` | No | Enables Quick start guest hosts in production; defaults to `true` in Docker Compose. Set `false` for email-only host access. |

### Database scripts

| Command | Purpose |
|---------|---------|
| `npm run db:up` | Start the full Docker stack (`docker compose up -d`) |
| `npm run db:down` | Stop the Docker stack |
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
│   │   ├── sign-in/page.tsx   # Host quick start or magic-link sign-in
│   │   ├── join/page.tsx      # Player join form
│   │   ├── dashboard/page.tsx # Host or player dashboard
│   │   └── api/
│   │       ├── auth/
│   │       │   ├── guest-host/route.ts
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
| `POST` | `/api/auth/guest-host` | Start a temporary host session (when guest hosting is enabled) |
| `POST` | `/api/auth/magic-link` | Request host magic link (returns `devToken` in development) |
| `POST` | `/api/auth/verify` | Consume magic-link token → host session cookie |
| `GET` | `/api/auth/session` | Current session |
| `DELETE` | `/api/auth/session` | Sign out |
| `GET` | `/api/rounds` | List host’s rounds |
| `POST` | `/api/rounds` | Create round (frozen tee snapshot + join code) |
| `POST` | `/api/rounds/join` | Join with a public code and playing details or a private invite |
| `POST` | `/api/rounds/[id]/fourballs` | Create a playing group with a starting hole |
| `POST/PATCH/DELETE` | `/api/rounds/[id]/players` | Manage the host roster and group assignments |
| `PUT` | `/api/rounds/[id]/scores` | Save a single score or the fourball’s entries for a hole |
| `POST` | `/api/rounds/[id]/alliance-draw` | Draw and save Mystery Betterball alliances |
| `GET` | `/api/rounds/[id]/leaderboard` | Live individual and competition standings |
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

## Host sign-in and guest hosting

The **Quick start** tab on `/sign-in` creates a temporary host account from a display
name and starts a 14-day host session. Docker deployments enable it by default;
set `ALLOW_GUEST_HOSTS=false` to make public deployments email-only.

In non-production, `POST /api/auth/magic-link` returns a `devToken`. Use **Open demo
magic link** on the sign-in page (or `POST /api/auth/verify` with that token) to
establish a host session without email.

## Docs

| Document | Path |
|----------|------|
| Architecture | [ARCHITECTURE.md](./ARCHITECTURE.md) |
| Product design | [docs/golf-live-leaderboard/design.md](./docs/golf-live-leaderboard/design.md) |
| Implementation plan | [docs/golf-live-leaderboard/implementation-plan.md](./docs/golf-live-leaderboard/implementation-plan.md) |
| Course data source | [docs/golf-live-leaderboard/course-data-source.md](./docs/golf-live-leaderboard/course-data-source.md) |
| Task tracker | [docs/golf-live-leaderboard/tasks/README.md](./docs/golf-live-leaderboard/tasks/README.md) |
