# Add Realtime Leaderboard Updates

## Summary

Participants need to see accepted scores reflected without refreshing. Publish validated score changes to authorized round members and provide polling fallback when the realtime connection is unavailable.

## User stories

- As a player, I want to see the leaderboard change as scores arrive.
- As a host, I want to monitor the whole round from one screen.

## Outcome

Provide a leaderboard showing player name, rank, Stableford total, holes completed, completion state, last-updated time, and connection status.

## Depends on

Task 07.

## Context

Only accepted server writes may publish events. A subscriber must be a current member of the round. The client can request a full leaderboard snapshot when an event is missed or when realtime is unavailable.

## Constraints

- Membership is checked before subscription.
- Events contain only the data needed to update affected leaderboard state.
- Poll every 10 seconds when realtime is unavailable.
- Normal delivery target is within 3 seconds.
- Realtime failure must not block HTTPS score saves.

## Acceptance criteria

- A score update on one device updates another device within 3 seconds under normal conditions.
- A disconnected client falls back to polling.
- An unauthorized user cannot subscribe to a round.
- The implementation satisfies `AC-5`.

## Checks

```text
npm test -- realtime
npx playwright test tests/live-leaderboard.spec.ts
npx playwright test tests/realtime-reconnect.spec.ts
```

Test simultaneous updates, reconnect, missed events, and unauthorized subscriptions.

## Out of scope

- Public spectator links
- Push notifications
- Cross-round leaderboards
