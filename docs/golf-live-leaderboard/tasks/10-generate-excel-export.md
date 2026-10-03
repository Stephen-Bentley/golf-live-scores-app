# Generate the Excel Export

## Summary

Hosts need a shareable record of the completed round. Generate an Excel workbook from one consistent snapshot containing setup details, leaderboard totals, hole-by-hole gross scores, and Stableford points.

## User stories

- As a host, I want to download a complete Excel workbook so that I can share or archive the results.
- As a player, I want to verify my hole-by-hole score and points.

## Outcome

The host can generate and download an `.xlsx` workbook with three sheets.

### Leaderboard sheet

- Rank
- Player name
- Playing handicap
- Holes completed
- Completion state
- Total Stableford points
- Total gross strokes

### Hole details sheet

- One row per player
- Hole numbers 1 through 18
- Gross score columns
- Stableford point columns
- Gross total
- Stableford total

### Round setup sheet

- Course
- Tee set
- Round ID
- Generated timestamp
- Hole par
- Hole stroke index
- Scoring rules note

## Depends on

Task 09.

## Context

The export must use the same scoring module and round snapshot as the leaderboard. The workbook should contain displayed values rather than depending on the viewing application to recalculate formulas.

## Constraints

- Export reads one frozen snapshot.
- Export generation cannot modify scores or round state.
- Only the host can request or download an export.
- Repeated requests are safe and produce equivalent values.
- Download links are short-lived.

## Acceptance criteria

- The host can generate an `.xlsx` file after marking the round ready for export.
- The workbook contains all required metadata, score columns, points columns, and totals.
- Exported totals match the leaderboard snapshot.
- A non-host cannot generate or download an export.
- The implementation satisfies `AC-8`, `AC-9`, and `INV-6`.

## Checks

```text
npm test -- export
npx playwright test tests/export.spec.ts
```

Open the generated workbook in an automated test and assert exact cell values, sheet names, totals, and metadata.

## Out of scope

- PDF export
- CSV export
- Custom printable scorecards
- Automated email distribution
