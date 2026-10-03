# Fairway Live architecture

> **Status:** Next.js 15 + TypeScript + PostgreSQL (Prisma) implementation  
> **Previous:** Vanilla JS / localStorage prototype retained in `_legacy_prototype/`

## 1. Executive summary

Fairway Live is a live golf scoring application. Hosts create rounds from course and tee data, share a short join code, and export Excel results. Players join as guests, enter gross scores on mobile, and see net Stableford points and a ranked leaderboard.

**Non-negotiable rule:** All score calculations use Stableford points with playing handicap, as implemented and unit-tested in `src/domain/scoring.ts`.

## 2. Stack

| Concern | Choice |
|---------|--------|
| Framework | Next.js 15 (App Router) + TypeScript |
| Validation | Zod (`src/lib/types.ts`) |
| Database | PostgreSQL + Prisma (`prisma/schema.prisma`) |
| Auth | Magic-link sessions (hosts); join-code guest sessions (players) |
| Unit tests | Vitest (`src/domain/scoring.test.ts`) |
| Excel | ExcelJS (`src/lib/export.ts`) |
| Styling | Tailwind CSS |
| External course data | GolfCourseAPI via server-only proxy |

## 3. System context

```
┌─────────────────────┐
│  Browser clients    │
│  (host / players)   │
└──────────┬──────────┘
           │ HTTPS
           ▼
┌──────────────────────────────────────────┐
│  Next.js App Router                      │
│  ┌────────────┐  ┌─────────────────────┐ │
│  │ Pages      │  │ API routes          │ │
│  │ /          │  │ /api/auth/*         │ │
│  │ /sign-in   │  │ /api/rounds/*       │ │
│  │ /join      │  │ /api/golf/courses   │ │
│  │ /dashboard │  └──────────┬──────────┘ │
│  └────────────┘             │            │
│       domain/scoring.ts ◄───┤            │
│       lib/export.ts     ◄───┤            │
└─────────────────────────────┼────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
        PostgreSQL      GolfCourseAPI    (future realtime
        (Prisma)        Bearer proxy      channel / SSE)
```

## 4. Architectural invariants

1. **Frozen tee snapshot** — Each round stores `teeSetSnapshot` (JSON: 18 holes with par, stroke index, optional distance). Catalog or API changes must not alter an existing round.
2. **Handicap strokes** — `floor(playingHandicap / 18) + (strokeIndex <= playingHandicap % 18 ? 1 : 0)`.
3. **Stableford points** — `max(0, 2 + par - netScore)` where `netScore = grossScore - handicapStrokes`.
4. **Gross is source of truth** — Only gross scores are stored; points are always derived from the snapshot and handicap.
5. **Closed / archived rounds** — Reject all score writes.
6. **Authorization** — Hosts manage only their rounds; players edit only their own scores; hosts may correct any score in their round.
7. **Join codes** — Random, non-sequential, revocable; unique display names within a round (case-insensitive trim).

## 5. Components and responsibilities

### Pages (`src/app/`)

| Route | Role |
|-------|------|
| `/` | Landing |
| `/sign-in` | Host magic-link request + dev verify |
| `/join` | Player join (code, name, handicap) |
| `/dashboard` | Host round list or player active-round summary |

Score-entry and dedicated leaderboard pages can be added under `/rounds/[id]/…` and should call the existing APIs.

### API routes (`src/app/api/`)

| Route | Responsibility |
|-------|----------------|
| `auth/magic-link` | Create `MagicLinkToken` (returns `devToken` in development) |
| `auth/verify` | Consume token → `User` + host session cookie |
| `auth/session` | Read or clear session cookies |
| `rounds` | List host rounds; create round with frozen snapshot + join code |
| `rounds/join` | Validate code, enforce unique name / max players, create `Player`, set player session |
| `rounds/[id]/scores` | Validate, rate-limit, version/conflict check, upsert `ScoreEntry` + `ScoreEvent` |
| `rounds/[id]/leaderboard` | Authz check; build ranking via `buildLeaderboard` |
| `rounds/[id]/export` | Host-only ExcelJS workbook when status is `ready_for_export` or `closed` |
| `golf/courses` | Proxy search to GolfCourseAPI; never expose API key to the browser |

### Domain (`src/domain/scoring.ts`)

Pure functions only (no I/O):

- `getHandicapStrokes`
- `getStablefordPoints`
- `getPlayerSummary`
- `buildLeaderboard`

Covered by Vitest in `scoring.test.ts`.

### Lib

| Module | Owns |
|--------|------|
| `lib/db.ts` | Prisma client singleton |
| `lib/auth.ts` | Magic-link tokens, host/player cookies, join-code generation |
| `lib/types.ts` | Zod request schemas |
| `lib/export.ts` | Three-sheet Excel workbook (Leaderboard, Hole details, Round setup) |

## 6. Data model (Prisma)

Core entities (see `prisma/schema.prisma`):

- **User** — host identity (`email`)
- **Course / TeeSet / Hole** — catalog (optional path; rounds may also receive snapshots from API import)
- **Round** — `joinCode`, `teeSetSnapshot` (JSON), `status` (`setup` → `active` → `ready_for_export` → `closed` → `archived`)
- **Player** — `displayName`, `playingHandicap`, unique per round
- **ScoreEntry** — gross score per player/hole, `version`, `enteredBy`
- **ScoreEvent** — audit history of score changes
- **ExportJob** — export requests + expiry metadata
- **MagicLinkToken** — one-time host sign-in tokens

## 7. Critical flows

### Host sign-in

1. Client `POST /api/auth/magic-link` with email  
2. Server stores token (dev returns `devToken`)  
3. Client `POST /api/auth/verify`  
4. HttpOnly host session cookie set  

### Round creation

1. Host authenticated  
2. `POST /api/rounds` with course name, location, and 18-hole `teeSetSnapshot`  
3. Server validates unique stroke indexes 1–18, generates join code, persists round  

### Player join

1. `POST /api/rounds/join` with code, display name, playing handicap  
2. Server checks code active, capacity (100), unique name  
3. Creates `Player`, sets player session cookie  

### Score save

1. `PUT /api/rounds/[id]/scores` with hole, gross score, optional `clientVersion` / `playerId` (host)  
2. Reject if closed; rate-limit 10 writes/player/minute  
3. Conflict (409) if `clientVersion` ≠ stored version  
4. Upsert score + history event; promote `setup` → `active`  

### Export

1. Host marks round `ready_for_export` or `closed` (status update via future host API/UI)  
2. `POST /api/rounds/[id]/export`  
3. Rate-limit 5/hour; generate ExcelJS buffer; record `ExportJob`  

## 8. Security and trust boundaries

- **API key boundary:** `GOLF_COURSE_API_KEY` is server-only; browser calls `/api/golf/*` only.  
- **Sessions:** HttpOnly cookies; host vs player roles enforced on each route.  
- **Input:** Zod validates emails, handicaps (0–54), scores (1–20), hole numbers, names.  
- **Join code:** Capability token — revocable (`joinCodeActive`), not a long-lived identity.  

## 9. Operational limits (Task 11)

| Limit | Value |
|-------|-------|
| Players per round | 100 |
| Score writes per player per minute | 10 |
| Exports per round per hour | 5 |
| Default retention | 12 months (documented; enforcement TBD) |

## 10. Verification

| Layer | How |
|-------|-----|
| Scoring | `npm test` — Vitest on handicap, Stableford bands, summaries, ranking |
| Types | `npm run typecheck` |
| Lint | `npm run lint` |
| API / UI | Manual or future Playwright tests |

## 11. Known limitations and next steps

- Course catalog admin UI and create-round form in the dashboard are not fully built (APIs and schema support them).
- Mobile score-entry and live leaderboard pages should be added under `/rounds/[id]/…` and wired to existing APIs.
- Realtime: leaderboard API is poll-ready; WebSocket/SSE not yet implemented.
- Production magic-link needs an email provider (dev uses returned token).
- Playwright browser tests not scaffolded yet.
- Row-level security in PostgreSQL can be added later; authorization is currently enforced in API handlers.

## 12. Source map

| Concern | Path |
|---------|------|
| Entry / pages | `src/app/**/page.tsx` |
| API | `src/app/api/**/route.ts` |
| Scoring engine | `src/domain/scoring.ts` |
| Scoring tests | `src/domain/scoring.test.ts` |
| Zod schemas | `src/lib/types.ts` |
| Auth / sessions | `src/lib/auth.ts` |
| Prisma client | `src/lib/db.ts` |
| Excel export | `src/lib/export.ts` |
| Database schema | `prisma/schema.prisma` |
| Product design | `docs/golf-live-leaderboard/design.md` |
| Implementation plan | `docs/golf-live-leaderboard/implementation-plan.md` |
| Task tracker | `docs/golf-live-leaderboard/tasks/README.md` |
| Legacy prototype | `_legacy_prototype/` |
