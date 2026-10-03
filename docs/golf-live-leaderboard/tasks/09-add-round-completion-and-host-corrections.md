# Add Round Completion and Host Corrections

## Summary

Hosts need to review the final score state, correct mistakes, mark the round ready for export, and prevent further edits when the round is closed.

## User stories

- As a host, I want to correct a score before finalizing the round.
- As a host, I want to lock the round so that the exported result cannot change unexpectedly.

## Outcome

The host can review all players, see missing holes, correct any score, mark a round ready for export, close it, reopen a ready-for-export round, and revoke the join code.

## Depends on

Tasks 03, 05, 07, and 08.

## Context

The round lifecycle is `setup` to `active` to `ready_for_export` to `closed`, with `archived` as the retention state. A closed round is read-only. The host must see warnings before making a round exportable if players have missing holes.

## Constraints

- Closing a round blocks all score writes, including host writes.
- Closed rounds remain readable to existing members.
- Corrections create auditable score events.
- The final state used for export is a consistent database snapshot.
- The host must see incomplete players before export readiness.

## Acceptance criteria

- The host can identify players with missing holes.
- A host correction updates the leaderboard immediately.
- A closed round rejects score writes.
- Existing members can still read a closed round.
- The implementation satisfies `AC-6`, `AC-7`, and `INV-6`.

## Checks

```text
npm test -- round-lifecycle
npx playwright test tests/round-completion.spec.ts
```

Manually verify that a closed round cannot be edited from an already-open scoring screen.

## Out of scope

- Automatic round closure by time
- Official competition adjudication
