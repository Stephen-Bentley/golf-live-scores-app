# Golf Live Leaderboard Web App

> **Status:** Proposed for review

## 1. Executive summary

The app will let a group select a course and tee set, enter each player's handicap, record hole scores from a phone, and see a live leaderboard update as scores arrive. It will calculate net Stableford points for every hole using the selected tee's par and stroke index, then export a finished Excel workbook containing hole-by-hole gross scores, Stableford points, and totals.

The main tradeoff is that the app needs a small amount of structured setup before play: the course, tee set, hole data, and player handicaps must be correct. This is necessary to make live scoring and the final export reliable.

## 2. Context and scope

The product is intended for casual golf days, societies, and club competitions where players enter scores on mobile devices while a group watches progress. The first release covers one live round at a time, with multiple players entering their own scores or a nominated scorer entering scores for the group.

This design covers round setup, course and tee selection, player and handicap entry, live scoring, net Stableford calculation, leaderboard ranking, score correction, and Excel export. It does not cover official handicap submission, tournament registration, payments, tee-time booking, or a permanent handicap history.

## 3. System context

```text
Mobile browsers
     | HTTPS / realtime connection
     v
Web app  <---->  Round and scoring API  <---->  Database
     |                    |                       |
     |                    +----> Export worker --+----> .xlsx file
     v
Live leaderboard and score entry
```

The web app owns the round experience and scoring rules. The database is the source of truth for course, tee, player, and score data. A realtime channel publishes accepted score changes to all authorized round participants. Excel generation reads a completed or explicitly exportable round snapshot and must not alter scoring data.

The external source for course and tee data is [GolfCourseAPI](https://api.golfcourseapi.com/docs/api/). Search uses `GET /v1/search`; detail uses `GET /v1/courses/{id}`. Imported records use `tees.male`, `tees.female`, and each tee’s `holes` array to populate the internal 18-hole model. The API key is server-only and is sent as a Bearer token.

## 4. Proposed design

### How it works

1. A host creates a round, selects a course, selects a tee set, and confirms the 18-hole course data. The tee set supplies par, stroke index, and optional distance for each hole.
2. The host adds players and enters each player's playing handicap. The host shares a short join code or link.
3. Each player opens the round on a phone, chooses their name, and enters one gross score per hole. The app saves each score immediately and shows the calculated net Stableford points beside it.
4. The server validates the score, calculates points using the round's frozen course and handicap data, stores a new score version, and broadcasts the updated player total.
5. The leaderboard ranks players by Stableford points descending. A tie is displayed as a tie; the app does not invent a countback result unless a future competition rule is configured.
6. Once all scores are entered, the host selects Export Excel. The server generates a workbook from a consistent round snapshot and provides a download containing setup details, a leaderboard, and hole-by-hole score and points columns.

### Components and responsibilities

**Mobile scoring UI** owns fast score entry, local draft state, offline/reconnect indicators, and clear confirmation of saved scores. It does not calculate authoritative totals or decide who may edit a score.

**Round API** owns authentication, round membership, permissions, validation, score versioning, and the authoritative calculation request. It does not render the leaderboard.

**Scoring service** owns handicap-stroke allocation and Stableford calculation. It does not own user accounts, course editing, or export formatting.

**Realtime publisher** owns delivery of accepted score changes to connected participants. It does not accept an unvalidated score update.

**Export service** owns workbook creation from a frozen snapshot. It does not recalculate scores using a second implementation of the rules.

**Course catalog** owns courses, tee sets, and the 18-hole data required for scoring. A round stores a snapshot of the selected tee data so later catalog edits cannot change a historical round.

The catalog may receive course data from the documented Golf API, but it owns the normalized internal records and validation result. It does not rely on the external API during score calculation.

### Decisions

The first release uses a host-created round and a short join code. This keeps casual play simple and avoids requiring every player to create an account. The cost is that the host must protect the join code and can revoke a participant.

The authoritative handicap input is the player's playing handicap for this round, expressed as a whole number from 0 through 54. A future release may calculate playing handicap from handicap index, course rating, slope, par, and a configured allowance. Requiring a round handicap now avoids silently applying the wrong local handicap rules.

Scores are stored as gross strokes, and net Stableford points are derived from gross strokes, par, stroke index, and playing handicap. Storing gross scores preserves the original input and makes recalculation auditable.

The server uses last accepted write ordering for a given player and hole, with a visible score history for hosts. This gives predictable behavior when two devices edit the same hole. A player can edit their own score; the host can correct any score.

## 5. Invariants and requirements

### Invariants

- `INV-1`: Every active round has exactly one frozen tee-set snapshot with 18 holes, and each hole has par and a unique stroke index from 1 through 18.
- `INV-2`: A score is an integer from 1 through 20 strokes, or empty when not yet entered.
- `INV-3`: Authoritative Stableford points are calculated only by the server from the stored gross score and the round snapshot.
- `INV-4`: A player's handicap strokes are allocated by stroke index, with one stroke on each hole for every full 18 handicap strokes and one additional stroke on holes whose stroke index is at most the remainder.
- `INV-5`: An incomplete player's total is the sum of entered-hole points and is visibly marked incomplete; it cannot outrank a complete player solely because missing holes are treated as zero without that label.
- `INV-6`: Exported values come from one consistent round snapshot and match the leaderboard values for that snapshot.
- `INV-7`: Only round members may read a round, and only the host may change course, tee, player membership, completion state, or export availability.

### Requirements

- The setup flow must support course search, tee selection, and a clear preview of par and stroke index for all 18 holes.
- The course catalog must support at least multiple tee sets per course and both 9-hole and 18-hole display readiness, while the first scoring release requires an 18-hole round.
- Players must be able to enter scores hole by hole with large touch targets, a numeric input optimized for mobile, next/previous navigation, and a visible saved state.
- The app must allow a player to enter or edit their own scores and allow the host to edit any score.
- After every accepted score change, connected participants must receive the updated player total and leaderboard position within 3 seconds under normal service conditions.
- The scoring screen must show, for each hole, par, stroke index, gross score, handicap strokes received, and Stableford points.
- The leaderboard must show player name, holes completed, total Stableford points, and a clear incomplete/complete state.
- The UI must remain usable at 320px viewport width, support portrait orientation, and meet WCAG 2.2 AA contrast and keyboard-accessibility expectations.
- Export must be available only to the host after the host marks the round ready for export. The workbook must include round metadata, player handicap, hole par and stroke index, gross score and points for holes 1 through 18, and grand totals.
- The export must include a generated-at timestamp and a formula/rules note explaining that points use net score against par.

## 6. Interfaces and data

### Scoring rule

For each hole, let `netScore = grossScore - handicapStrokesOnHole`. Stableford points are:

| Net score relative to par | Points |
| --- | ---: |
| 2 or more over par | 0 |
| 1 over par | 1 |
| Par | 2 |
| 1 under par | 3 |
| 2 under par | 4 |
| 3 under par | 5 |
| 4 under par | 6 |

The table is implemented as `max(0, 2 + par - netScore)` and capped only by the score input limit, so an exceptional hole can receive more than 6 points if the competition later chooses to allow it. The default UI displays the resulting integer.

### Core data

```text
Course { id, name, location, active }
TeeSet { id, courseId, name, colour, rating?, slope?, holes[18] }
Hole { number, par, strokeIndex, distance? }
Round { id, hostId, joinCode, teeSetSnapshot, status, createdAt, completedAt? }
Player { id, roundId, displayName, playingHandicap, memberRole, joinedAt }
ScoreEntry { id, roundId, playerId, holeNumber, grossScore, version, enteredBy, updatedAt }
ScoreEvent { id, scoreEntryId, previousScore, newScore, actorId, createdAt }
```

Suggested API shapes are `POST /rounds`, `POST /rounds/{id}/players`, `PUT /rounds/{id}/scores/{playerId}/{holeNumber}`, `GET /rounds/{id}/leaderboard`, and `POST /rounds/{id}/exports`. A score update includes the client version and receives either the accepted authoritative score or a conflict response containing the latest value.

### Naming and identity

Database IDs are opaque generated IDs. Join codes are random, non-sequential, and expire when the round is closed. Display names are unique within a round after case-insensitive trimming. The selected course and tee names are copied into the round snapshot, so renaming a catalog item cannot change an existing round or export.

## 7. Failure behavior and lifecycle

Score entry first writes a local draft and then sends it to the server. If the network is unavailable, the UI marks the value as unsent and retries when connectivity returns. The server remains authoritative; if another device changed the same hole, the UI shows the server value and asks the player to confirm a replacement.

If realtime delivery fails, score saves still work through HTTPS and the UI polls the leaderboard every 10 seconds until the connection recovers. A save request is idempotent by client mutation ID, so retries cannot create duplicate score events.

If export generation fails, no round data changes. The host sees a retry action and the service records the failure. A completed round remains readable and exportable until explicitly archived. Closing a round blocks new edits but preserves read-only access and previously generated files.

## 8. Security, privacy, and operations

The join code is a capability, not proof of identity, so it must be unguessable and revocable. Host actions require host authentication. Player actions require a signed session tied to the round membership and may edit only that player's scores. All inputs are validated server-side, including names, handicap range, score range, hole number, and membership.

The app stores names and scoring data only for the round's retention period. Default retention should be 12 months, configurable by the operator. Do not collect date of birth, precise location, or unnecessary profile data. Exports should be downloadable only by the host and served using short-lived links.

Operational limits should start at 100 players per round, 10 score writes per player per minute, and 5 export requests per round per hour. At a limit, the API returns a clear retryable response and does not drop accepted scores. Metrics should cover score-save latency, realtime delivery latency, export duration, failed exports, and reconnect rate.

## 9. Acceptance criteria

- `AC-1`: A host can create a round by selecting a course and tee set, and the app shows all 18 holes with the selected par and stroke index.
- `AC-2`: A player can join using a valid join code, see their name, enter scores on a mobile viewport, and see each score's saved state.
- `AC-3`: Given par 4, stroke index 1, playing handicap 10, and gross score 5, the app assigns one handicap stroke, derives net par, and awards 2 Stableford points.
- `AC-4`: Given playing handicap 20, the app assigns two strokes to stroke indexes 1 and 2 and one stroke to stroke indexes 3 through 18.
- `AC-5`: When one participant changes a score, all connected participants see the new total and reordered leaderboard within 3 seconds in the normal test environment.
- `AC-6`: A player with missing holes is marked incomplete, and the leaderboard exposes holes completed and entered-points total.
- `AC-7`: A host correction updates the score history, authoritative points, leaderboard, and future export consistently.
- `AC-8`: The host can generate an `.xlsx` file containing round metadata, player handicaps, 18 gross-score columns, 18 Stableford-point columns, and grand totals for both.
- `AC-9`: Recalculating the workbook's displayed totals from the exported hole values produces the same totals shown in the leaderboard snapshot.
- `AC-10`: A non-member cannot read the round after the join code is revoked, and a non-host cannot change course, players, or export state.

## 10. Test approach

Unit tests cover handicap allocation at 0, 1, 17, 18, 19, 36, and 54, all Stableford score bands, invalid inputs, and `INV-1` through `INV-4`. Property tests should verify that adding one handicap stroke never reduces points on a hole and that recalculation is deterministic.

API and integration tests cover membership authorization, idempotent retries, conflicting edits, round snapshots, incomplete totals, realtime publication, rate limits, and `INV-5` through `INV-7`.

Browser tests cover the mobile scoring flow, reconnect behavior, keyboard use, a 320px viewport, host correction, and `AC-1` through `AC-7`. Export tests open the generated workbook and verify sheet names, cell values, totals, metadata, and `AC-8` through `AC-9`. Security tests cover join-code revocation and unauthorized reads or writes for `AC-10`.

## 11. Risks and tradeoffs

- Incorrect course data produces incorrect points for everyone. Mitigation: require a hole-by-hole preview at setup, validate stroke-index uniqueness, and freeze the snapshot.
- Casual users may forget whether a handicap is an index or a playing handicap. Mitigation: label the field “Playing handicap for this round” and explain that the app does not convert it in the first release.
- Poor connectivity can make players think a score was lost. Mitigation: local draft state, explicit unsent status, retry, and server-value conflict handling.
- A very large group can increase realtime fan-out. Mitigation: cap initial round size, send compact leaderboard patches, and add a read-only polling fallback.
- Different competitions may use different Stableford allowances or countback rules. Mitigation: keep those as future configurable rules rather than silently applying a local variant.

## 12. Open questions

- Should the first release calculate playing handicap from handicap index, course rating, slope, and a handicap allowance? Recommended default: no, accept a round playing handicap; this is non-blocking for the proposed MVP.
- Should incomplete players be ranked below all complete players, or shown in a separate section? Recommended default: separate “In progress” section; non-blocking.
- Should a 9-hole round be supported in the first release? Recommended default: no, but keep the course model extensible; non-blocking.
- Should the export contain one row per player or a scorecard-style layout? Recommended default: both a leaderboard sheet and a scorecard sheet, with one player per row on the leaderboard sheet; non-blocking.
- What authentication method should hosts use? Recommended default: email magic link or passkey, depending on the chosen platform; this becomes blocking before implementation.
- What production credential and quota policy should be used for GolfCourseAPI? Recommended default: configure `GOLF_COURSE_API_KEY` as a server-only secret and keep searches explicit because the free tier is limited to 35 requests per day.

## 13. Out of scope

- Official handicap calculation, handicap verification, or submission to a governing body.
- Native iOS or Android apps; the first release is a responsive web app.
- Payments, club subscriptions, tee-time booking, GPS range finding, shot tracking, and live tournament broadcasting.
- Public indexing of rounds or player names.
- Advanced competition rules such as countback, team formats, skins, match play, or multiple simultaneous rounds.
