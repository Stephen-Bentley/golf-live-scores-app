# Build Mobile Score Entry

## Summary

Players need a fast scorecard interface for entering one hole at a time. Build a mobile-first flow that saves scores immediately, preserves unsent drafts, and explains conflicts when another device changed the same hole.

## User stories

- As a player, I want to enter a hole score with one hand so that I can score while walking the course.
- As a player, I want to see par, stroke index, handicap strokes, and points so that I can verify the calculation.

## Outcome

Provide a scoring screen with a current-hole card, large numeric score control, previous and next navigation, progress indicator, gross score, par, stroke index, handicap strokes, Stableford points, and saved-state feedback.

## Depends on

Tasks 04 and 05.

## Context

The server is authoritative. The client may calculate a provisional value for responsiveness, but it must replace it with the server result after a successful save. Each write has a client mutation ID and client version for idempotency and conflict detection.

## Constraints

- Scores must be integers from 1 through 20.
- Local drafts are marked unsent when the network is unavailable.
- Retries must not create duplicate score events.
- A conflict shows the local value and server value and requires explicit confirmation before replacement.
- The UI must remain usable at 320px width.

## Acceptance criteria

- A player can enter all 18 scores from a 320px mobile viewport.
- Each accepted score displays authoritative Stableford points.
- An offline score is visibly marked unsent and retries after reconnection.
- Invalid scores are rejected with a clear message.
- A conflict shows both the local value and server value.
- The implementation satisfies `AC-2`, `AC-3`, and `AC-7`.

## Checks

```text
npm test -- score-entry
npx playwright test tests/mobile-score-entry.spec.ts
npx playwright test tests/offline-score-entry.spec.ts
```

Manually test portrait mode, browser refresh during an unsent draft, and a conflict from two devices.

## Out of scope

- Voice score entry
- GPS hole detection
- Native mobile applications
