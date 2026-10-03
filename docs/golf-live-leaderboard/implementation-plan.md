# Golf Live Leaderboard Implementation Plan

> **Status:** Proposed for implementation

This plan assumes a responsive Next.js/TypeScript web app backed by PostgreSQL, managed authentication, realtime updates, and file storage.

Recommended tools:

- Next.js and TypeScript
- PostgreSQL with row-level authorization
- Email magic-link authentication for hosts
- Guest player sessions secured by round join codes
- Zod for request validation
- Vitest for unit and integration tests
- Playwright for mobile browser tests
- ExcelJS for workbook generation

The source design is [design.md](./design.md).

## Milestone 1: Application foundation

## Task 1: Create the protected application shell

### Summary

Create the application foundation so a host can sign in, reach a protected dashboard, and use a consistent mobile-first visual system.

### User stories

- As a host, I want to securely access my rounds so that only authorized users can manage scoring.
- As a player, I want the application to work comfortably on a phone.

### Outcome

A running web application with host authentication, protected routes, responsive layout, shared UI components, base error handling, and loading states.

### Depends on

None.

### Constraints

- Use email magic-link authentication for hosts.
- Players use round-specific guest sessions rather than full accounts.
- Do not expose round data before membership is established.
- Use the design’s terminology: host, player, round, tee set, hole, playing handicap, and Stableford points.

### Acceptance criteria

- A host can request a magic link and reach a protected dashboard.
- An unauthenticated visitor cannot access host routes.
- The layout is usable at 320px width.
- All primary actions have visible focus states.
- The application meets the foundation requirements in `AC-10` and the accessibility requirements in the source design.

### Checks

```text
npm run lint
npm run typecheck
npm test
npx playwright test tests/auth.spec.ts
```

### Out of scope

- Course management
- Round creation
- Player joining
- Score entry

## Milestone 2: Course data and round setup

## Task 2: Build the course and tee-set catalog

### Summary

Build the catalog structure and administrator workflow for courses, tee sets, and 18 holes so that scoring uses trusted course data.

### User stories

- As a host, I want to select a course and tee set so that scoring uses the correct hole information.
- As an operator, I want invalid hole data rejected so that scores cannot be calculated incorrectly.

### Outcome

A course catalog supporting course names, locations, multiple tee sets, tee colours, hole pars, stroke indexes, and optional distances.

### Depends on

Task 1.

### Constraints

- A tee set must contain exactly 18 holes.
- Stroke indexes must be unique and range from 1 through 18.
- Catalog changes must not modify historical rounds.
- The first release requires 18-hole tee sets.

### Acceptance criteria

- A valid course and tee set can be created and viewed.
- A tee set with missing holes, duplicate stroke indexes, or invalid par values is rejected.
- The UI previews all 18 holes before a tee set is selected.
- The implementation satisfies `INV-1` and `AC-1`.

### Checks

```text
npm test -- course
npm run typecheck
npx playwright test tests/course-catalog.spec.ts
```

### Out of scope

- Public course search
- GPS data
- 9-hole scoring
- Automatic import from external golf databases

## Task 3: Create rounds and freeze course data

### Summary

Build a controlled setup flow that creates a round from a selected course and tee set. The round must preserve the selected course data even if the catalog changes later.

### User stories

- As a host, I want to create a round quickly so that players can join before play starts.
- As a host, I want the round’s course data frozen so that results remain reproducible.

### Outcome

A host can select a course, select a tee set, preview all 18 holes, create a round, receive a join code, and reopen the round from the dashboard.

### Depends on

Tasks 1 and 2.

### Constraints

- Join codes must be random, non-sequential, and revocable.
- Round snapshots include course name, tee name, par, stroke index, colour, and optional distances.
- Round states are `setup`, `active`, `ready_for_export`, `closed`, and `archived`.
- Only the host can change course, tee, status, or export readiness.

### Acceptance criteria

- A host can create a round from a valid tee set.
- The round displays its join code and hole preview.
- Editing the course catalog after round creation does not change the round snapshot.
- A non-host cannot change round setup.
- The implementation satisfies `AC-1`, `AC-10`, and `INV-7`.

### Checks

```text
npm test -- rounds
npx playwright test tests/round-setup.spec.ts
```

### Out of scope

- Player scoring
- Export generation
- Countback rules

## Milestone 3: Scoring rules and participants

## Task 4: Implement the handicap and Stableford calculation engine

### Summary

Implement the scoring rules as a deterministic domain module isolated from the interface and export code.

### User stories

- As a player, I want my handicap strokes applied to the correct holes so that my points are accurate.
- As a host, I want the score calculation to be consistent across the leaderboard and export.

### Outcome

A pure scoring module that calculates handicap strokes, net score, Stableford points, player total, holes completed, and completion state.

### Depends on

None.

### Constraints

Handicap strokes use:

```text
strokesOnHole = floor(handicap / 18)
                 + 1 when strokeIndex <= handicap % 18
```

Stableford points use:

```text
max(0, 2 + par - netScore)
```

Gross scores are integers from 1 through 20.

### Acceptance criteria

- A handicap of 0 assigns no strokes.
- A handicap of 18 assigns one stroke to every hole.
- A handicap of 20 assigns two strokes to stroke indexes 1 and 2 and one stroke to all other holes.
- Stableford points match every defined score band.
- The scoring engine is deterministic and has no database or UI dependencies.
- The implementation satisfies `INV-2`, `INV-3`, `INV-4`, and `AC-3`.

### Checks

```text
npm test -- scoring
npm run test:coverage -- scoring
```

Required test handicaps are 0, 1, 17, 18, 19, 20, 36, 37, and 54.

### Out of scope

- Handicap-index conversion
- Course-rating and slope calculations
- Competition-specific Stableford allowances

## Task 5: Add player joining and permissions

### Summary

Allow players to join a round without creating full accounts, while enforcing the difference between host and player permissions.

### User stories

- As a player, I want to join with a short code so that I can start scoring quickly.
- As a host, I want to control who is in my round so that the leaderboard is private.

### Outcome

Players can enter a valid join code, enter a display name, join a round, reopen the round on the same device, and leave or be removed. Hosts can add, rename, remove, and manage participants.

### Depends on

Tasks 1 and 3.

### Constraints

- Display names must be unique within a round after trimming and case normalization.
- Player sessions are scoped to one round.
- Players may edit only their own scores.
- Hosts may edit any score.
- Revoking the join code blocks new joins but does not remove existing members.

### Acceptance criteria

- A valid join code allows a player to join.
- An invalid or revoked code is rejected.
- A player cannot read another private round.
- A player cannot change course, tee, player membership, or export state.
- The implementation satisfies `INV-7` and `AC-10`.

### Checks

```text
npm test -- membership
npx playwright test tests/player-join.spec.ts
```

### Out of scope

- Social profiles
- Club membership
- Public player directories

## Milestone 4: Score entry and live leaderboard

## Task 6: Build mobile score entry

### Summary

Build a fast, forgiving scorecard interface for entering scores one hole at a time, with immediate save feedback.

### User stories

- As a player, I want to enter a hole score with one hand so that I can score while walking the course.
- As a player, I want to see par, stroke index, handicap strokes, and points so that I can verify the calculation.

### Outcome

A mobile score-entry flow with a current-hole card, large numeric control, navigation, progress indicator, score details, saved states, local draft preservation, and conflict handling.

### Depends on

Tasks 4 and 5.

### Constraints

- The client may show a provisional calculation, but the server result is authoritative.
- Score saves use a client mutation ID for idempotent retries.
- A score update includes the client version.
- A conflict returns the latest stored score and requires visible user confirmation before replacement.

### Acceptance criteria

- A player can enter all 18 scores from a 320px mobile viewport.
- Each accepted score displays its authoritative Stableford points.
- A disconnected score is visibly marked unsent and retries after reconnection.
- Invalid scores are rejected with a clear message.
- A conflict shows both the local value and the server value.
- The implementation satisfies `AC-2`, `AC-3`, and `AC-7`.

### Checks

```text
npm test -- score-entry
npx playwright test tests/mobile-score-entry.spec.ts
npx playwright test tests/offline-score-entry.spec.ts
```

### Out of scope

- Voice score entry
- GPS hole detection
- Native mobile applications

## Task 7: Add authoritative score storage and leaderboard queries

### Summary

Add reliable server-side score storage that recalculates totals from stored scores and exposes incomplete players correctly.

### User stories

- As a player, I want to see my current total.
- As a host, I want leaderboard totals to remain consistent after edits and reconnects.

### Outcome

The server supports score creation and updates, score versions, score history, player totals, holes completed, completion state, leaderboard ordering, and stable tie display.

### Depends on

Tasks 4 and 5.

### Constraints

- Gross scores are the stored source values.
- Stableford points are derived, not independently edited.
- Last accepted write ordering applies to a player and hole.
- Host corrections create score history records.
- The server uses the frozen round snapshot.

### Acceptance criteria

- A score update changes the player total.
- A score correction changes the total and preserves previous-value history.
- Incomplete players show holes completed and entered-points total.
- Ranking is ordered by Stableford total descending.
- Ties remain ties.
- The implementation satisfies `INV-3`, `INV-5`, `INV-6`, `AC-6`, and `AC-7`.

### Checks

```text
npm test -- leaderboard
npm test -- score-history
```

### Out of scope

- Countback ranking
- Team leaderboard calculations
- Match-play scoring

## Task 8: Add realtime leaderboard updates

### Summary

Add realtime publication so authorized participants see accepted score changes without refreshing.

### User stories

- As a player, I want to see the leaderboard change as scores arrive.
- As a host, I want to monitor the whole round from one screen.

### Outcome

A leaderboard screen showing player name, Stableford total, holes completed, completion state, rank, last-updated indication, and connection state.

### Depends on

Task 7.

### Constraints

- Only validated server writes produce realtime events.
- Membership is checked before subscribing.
- The client polls every 10 seconds if realtime is unavailable.
- Normal update delivery target is within 3 seconds.

### Acceptance criteria

- A score update on one device updates the leaderboard on another device within 3 seconds under normal conditions.
- A disconnected realtime client falls back to polling.
- An unauthorized user cannot subscribe to a round.
- The implementation satisfies `AC-5`.

### Checks

```text
npm test -- realtime
npx playwright test tests/live-leaderboard.spec.ts
npx playwright test tests/realtime-reconnect.spec.ts
```

### Out of scope

- Public spectator links
- Push notifications
- Cross-round leaderboards

## Milestone 5: Completion and export

## Task 9: Add round completion and host corrections

### Summary

Give hosts a controlled way to review scores, correct mistakes, mark a round ready for export, and close editing.

### User stories

- As a host, I want to correct a score before finalizing the round.
- As a host, I want to lock the round so that the exported result cannot change unexpectedly.

### Outcome

The host can review players, see missing holes, correct scores, mark the round ready for export, close the round, reopen a ready-for-export round, and revoke the join code.

### Depends on

Tasks 3, 5, 7, and 8.

### Constraints

- The host must see an incomplete-player warning before export readiness.
- Closing a round blocks score edits.
- Closed rounds remain readable.
- Corrections remain auditable.
- Final state is based on a consistent database snapshot.

### Acceptance criteria

- The host can identify players with missing holes.
- A host correction updates the leaderboard immediately.
- A closed round rejects score writes.
- Existing members can still read a closed round.
- The implementation satisfies `AC-6`, `AC-7`, and `INV-6`.

### Checks

```text
npm test -- round-lifecycle
npx playwright test tests/round-completion.spec.ts
```

### Out of scope

- Automatic round closure by time
- Official competition adjudication

## Task 10: Generate the Excel export

### Summary

Generate a complete Excel workbook containing gross scores, hole-by-hole Stableford points, totals, and round metadata.

### User stories

- As a host, I want to download a complete Excel workbook so that I can share or archive the results.
- As a player, I want to verify my hole-by-hole score and points.

### Outcome

The export service generates an `.xlsx` workbook with three sheets.

#### Sheet 1: Leaderboard

- Rank
- Player name
- Playing handicap
- Holes completed
- Completion state
- Total Stableford points
- Total gross strokes

#### Sheet 2: Hole details

- One row per player
- Hole numbers 1 through 18
- Gross score columns
- Stableford point columns
- Gross total
- Stableford total

#### Sheet 3: Round setup

- Course
- Tee set
- Round ID
- Generated timestamp
- Hole par
- Hole stroke index
- Scoring rules note

### Depends on

Task 9.

### Constraints

- Export reads one frozen snapshot.
- Export generation cannot modify scores or round state.
- Only the host can request or download an export.
- Repeated export requests are safe and produce equivalent values.
- The workbook contains displayed values even if formulas are not recalculated by the viewing application.

### Acceptance criteria

- The host can generate an `.xlsx` file after marking the round ready for export.
- The workbook contains all required metadata, score columns, points columns, and totals.
- Exported totals match the leaderboard snapshot.
- A non-host cannot generate or download an export.
- The implementation satisfies `AC-8`, `AC-9`, and `INV-6`.

### Checks

```text
npm test -- export
npx playwright test tests/export.spec.ts
```

The test suite must open the generated workbook and assert exact cell values.

### Out of scope

- PDF export
- CSV export
- Custom printable scorecards
- Automated email distribution

## Milestone 6: Hardening and release

## Task 11: Add observability, rate limits, and operational safeguards

### Summary

Add safeguards for authentication, realtime connections, repeated writes, file generation, and round data retention.

### User stories

- As an operator, I want failed saves and exports to be visible so that issues can be diagnosed.
- As a host, I want abusive or accidental requests to be limited without losing accepted scores.

### Outcome

Add structured logging, score-save latency metrics, realtime delivery metrics, export metrics, reconnect metrics, rate limits, round-size limits, export request limits, error reporting, short-lived export links, and configurable retention.

### Depends on

Tasks 1 through 10.

### Constraints

Initial limits:

- 100 players per round
- 10 score writes per player per minute
- 5 exports per round per hour
- 12-month default round retention

Rate-limited requests must fail clearly and must not overwrite accepted scores. Sensitive data must not appear in ordinary logs.

### Acceptance criteria

- Metrics are emitted for score saves, realtime delivery, exports, and reconnects.
- Rate limits return an explicit retryable response.
- Export links expire.
- Retention behavior is documented and testable.
- No sensitive data appears in ordinary logs.

### Checks

```text
npm run lint
npm run typecheck
npm test
```

Also perform a manual review of logs, authorization failures, and expired download links.

### Out of scope

- Multi-region deployment
- Full analytics dashboard
- Billing and subscription management

## Recommended delivery order

### Release 1: Scoring foundation

Tasks 1 through 5. This produces a host-authenticated application where a host can create a valid round, select a tee set, and invite players.

### Release 2: Playable live scoring

Tasks 6 through 8. This produces the core value: players can enter scores from phones and see the leaderboard update live.

### Release 3: Final results

Tasks 9 and 10. This adds locking, correction, completion, and the Excel export.

### Release 4: Production hardening

Task 11. This adds operational safeguards, monitoring, and release-readiness checks.

## Definition of done

The application is ready for an initial production pilot when:

- Acceptance criteria `AC-1` through `AC-10` pass.
- Invariants `INV-1` through `INV-7` have automated coverage.
- The app passes mobile browser testing at 320px and 390px widths.
- A complete 18-hole round can be run by at least two devices simultaneously.
- A generated workbook matches the final leaderboard exactly.
- Offline and reconnect behavior has been manually verified.
- Unauthorized reads and writes have been tested.
- The host can complete the entire workflow without administrative intervention.
