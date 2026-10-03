# Feature pack (implemented)

| Feature | Where |
|--------|--------|
| SSE live leaderboard | `GET /api/rounds/[id]/stream` + leaderboard UI |
| Host course catalog | `GET/POST /api/courses` |
| Player scorecard | `/rounds/[id]/scorecard` |
| Offline score queue | `src/lib/offline-queue.ts` + score entry |
| QR + invite message | Leaderboard invite card |
| Scoring formats | Stableford / stroke / modified Stableford |
| 9-hole rounds | `holesCount` on round + create form |
| Teams | Society totals, pairs, fourball better-ball; join team name; leaderboard team board |
| Playing handicap helper | `src/domain/handicap.ts` + `POST /api/handicap` |
| Round templates (clone) | `POST /api/rounds/[id]/clone` |
| Hole notes | `GET/PUT /api/rounds/[id]/notes` |
| Host analytics | Dashboard cards + `GET /api/host/stats` |
| Edit players | `PATCH/DELETE /api/rounds/[id]/players` |
| Last-hole activity | Leaderboard `lastHoleNumber` |
| Join rate limit | `src/lib/rate-limit.ts` on join |
| Guest host (no email) | `/api/auth/guest-host` |
| Tests | `tests/feature-pack.test.ts` + existing flow tests |

After pull:

```bash
npx prisma db push
npm test
npm run dev
```
