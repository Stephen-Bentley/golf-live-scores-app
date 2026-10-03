# Add Authoritative Score Storage and Leaderboard Queries

## Summary

Store gross scores on the server and derive all points and totals from the frozen round snapshot. Add score history so host corrections are auditable and leaderboard results remain consistent after edits.

## User stories

- As a player, I want to see my current total.
- As a host, I want leaderboard totals to remain consistent after edits and reconnects.

## Outcome

Provide APIs and persistence for score creation, updates, versions, score history, player totals, holes completed, completion state, ranking, and ties.

## Depends on

Tasks 04 and 05.

## Context

A score entry belongs to a round, player, and hole. It stores the gross score, version, actor, and update timestamp. A score event stores the previous value, new value, actor, and creation time. Stableford points are calculated from stored values and never independently edited.

## Constraints

- Gross scores are the source values.
- The server calculation uses the frozen tee-set snapshot.
- Last accepted write ordering applies to a player and hole.
- Host corrections create score history.
- Incomplete players show holes completed and entered-points total.
- Ranking is Stableford total descending, with ties displayed as ties.

## Acceptance criteria

- A score update changes the player total.
- A correction changes the total and preserves previous-value history.
- Incomplete players show holes completed and entered-points total.
- Ranking is ordered by Stableford total descending.
- Ties remain ties.
- The implementation satisfies `INV-3`, `INV-5`, `INV-6`, `AC-6`, and `AC-7`.

## Checks

```text
npm test -- leaderboard
npm test -- score-history
```

Test duplicate mutation IDs, stale versions, missing holes, corrections, and tied totals.

## Out of scope

- Countback ranking
- Team leaderboard calculations
- Match-play scoring
