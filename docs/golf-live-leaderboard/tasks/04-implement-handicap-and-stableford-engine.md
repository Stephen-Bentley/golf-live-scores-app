# Implement the Handicap and Stableford Calculation Engine

> **Status:** Done

## Summary
Stableford scoring is the core domain rule. Implement it as a deterministic module that can be reused by score storage, the leaderboard, the mobile UI, and Excel export without duplicating the rules.

## User stories

- As a player, I want handicap strokes applied to the correct holes so that my points are accurate.
- As a host, I want the calculation to be consistent across the leaderboard and export.

## Outcome

Provide pure functions for handicap allocation, net score, Stableford points, player totals, holes completed, and completion state.

## Depends on

None.

## Context

The first release accepts a player’s playing handicap directly as a whole number from 0 through 54. It does not convert a handicap index using course rating, slope, or an allowance.

## Constraints

For each hole:

```text
baseStrokes = floor(playingHandicap / 18)
extraStroke = 1 when strokeIndex <= playingHandicap % 18, otherwise 0
handicapStrokes = baseStrokes + extraStroke
```

Stableford points are:

```text
max(0, 2 + par - netScore)
```

Gross scores are integers from 1 through 20. A missing score contributes no entered-hole points and marks the player incomplete.

## Acceptance criteria

- Handicap 0 assigns no strokes.
- Handicap 18 assigns one stroke to every hole.
- Handicap 20 assigns two strokes to stroke indexes 1 and 2 and one stroke elsewhere.
- All defined Stableford score bands return the expected points.
- The module has no database or UI dependency.
- The implementation satisfies `INV-2`, `INV-3`, `INV-4`, and `AC-3`.

## Checks

```text
npm test -- scoring
npm run test:coverage -- scoring
```

Cover handicaps 0, 1, 17, 18, 19, 20, 36, 37, and 54, plus invalid values and missing scores.

## Out of scope

- Handicap-index conversion
- Course-rating and slope calculations
- Competition-specific Stableford allowances
