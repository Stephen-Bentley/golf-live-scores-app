# Golf Live Leaderboard Tasks

Source documents:

- [Product and technical design](../design.md)
- [Implementation plan](../implementation-plan.md)
- [Course data source](../course-data-source.md)

## Stack migration (2026-09-22)

The application has been migrated from the vanilla JS / localStorage prototype to the **specified stack**:

- Next.js 15 + TypeScript
- PostgreSQL + Prisma
- Zod validation
- Vitest unit tests
- ExcelJS export
- Magic-link host auth + join-code player sessions

Legacy prototype: `_legacy_prototype/`

## Current progress (on new stack)

| Task | Status on new stack |
|------|---------------------|
| 01 Application shell | **Complete** — shared UI, home, sign-in, join, dashboard |
| 02 Course catalog | Schema ready; create-round form captures 18-hole snapshot |
| 02a GolfCourseAPI | Proxy route implemented |
| 03 Rounds + freeze | **Complete** — API + `/rounds/new` UI |
| 04 Scoring engine | **Complete** — TypeScript + Vitest |
| 05 Player joining | **Complete** — join API + page |
| 06 Mobile score entry | **Complete** — `/rounds/[id]/score` with stepper UI |
| 07 Score storage + leaderboard | **Complete** — API + leaderboard page |
| 08 Realtime | Polling every 10s on leaderboard page |
| 09 Completion / corrections | **Complete** — host panel status + corrections |
| 10 Excel export | **Complete** — ExcelJS download from host panel |
| 11 Safeguards | Rate limits on scores/exports; max players |

## Recommended next work

1. Course catalog UI + create-round flow in the dashboard
2. Mobile score-entry page wired to `PUT /api/rounds/[id]/scores`
3. Leaderboard page with 10s polling
4. Host controls (status transitions, revoke join code)
5. Playwright tests
