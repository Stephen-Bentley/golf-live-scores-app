# Feature pack (implemented)

| Feature | Where |
|--------|--------|
| SSE live leaderboard | `GET /api/rounds/[id]/stream` + leaderboard UI |
| Host course catalog | `GET/POST /api/courses` |
| Player scorecard | `/rounds/[id]/scorecard` |
| Offline score queue | `src/lib/offline-queue.ts` + score entry |
| QR + invite message | Leaderboard invite card |
| Scoring formats | Stableford / stroke / modified Stableford |
| Nine- and 18-hole rounds | Score entry, leaderboard progress, and Excel columns use the round's hole count |
| Fourballs and shotgun starts | Host roster supports up to four players per group and a starting hole for each group. Score entry wraps to hole 1 after the last numbered hole. |
| Shared score entry | Players can save their individual score or enter scores for their assigned fourball |
| Teams and pairs | Competition pairs are assignable separately from playing groups |
| Team standings export | Excel includes team or alliance standings when competition results exist |
| Playing handicap helper | `src/domain/handicap.ts` + `POST /api/handicap` |
| Round templates (clone) | `POST /api/rounds/[id]/clone` |
| Hole notes | `GET/PUT /api/rounds/[id]/notes` |
| Host analytics | Dashboard cards + `GET /api/host/stats` |
| Edit players | `PATCH/DELETE /api/rounds/[id]/players` |
| Last-hole activity | Leaderboard `lastHoleNumber` |
| Join rate limit | `src/lib/rate-limit.ts` on join |
| Guest host (no email) | Quick start on `/sign-in` → `POST /api/auth/guest-host`; enabled by default in Docker and controlled by `ALLOW_GUEST_HOSTS` in production |
| Tests | `tests/feature-pack.test.ts` + existing flow tests |

## Competition scoring

| Format | Rule |
|--------|------|
| Betterball | Count the better score in each pair on each hole |
| Betterball with both scores on par 3s | Count both scores on par 3s and the better score on other holes |
| Mystery Sippy Cup 4Ball Alliance | Count the best two scores per hole from the fourball. Cap playing handicaps at 18. Score entry shows the mulligan and par-5 drive rules. |
| Mystery Betterball Alliance | Draw pairs into alliances once. Each alliance combines the two constituent Betterball scores. |

## Verification

- A Docker browser run verified public join codes, private player links, fourball assignment, shared scoring, and individual score edits against PostgreSQL.
- The nine-hole Sippy Cup round stopped at hole 9. Its live standings and downloaded Excel workbook matched at 39 points, and the workbook contained nine hole columns.
- The 18-hole Betterball round started at hole 10 and wrapped from 18 to 1. The browser confirmed the par-3 and par-4 scoring rules before rapid test entry hit the write limit.
- The Mystery Betterball draw used all four pairs once, produced the expected two 5-point alliances, and persisted after reload. The separate alliance export and the final holes of the 18-hole browser run remain to be verified.

## Local checks

```bash
npx prisma migrate deploy
npm test
npm run dev
```
