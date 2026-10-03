# Add Player Joining and Permissions

## Summary

Players need to enter a round without creating full accounts. Add join-code membership, guest sessions, and authorization rules that separate player actions from host actions.

## User stories

- As a player, I want to join with a short code so that I can start scoring quickly.
- As a host, I want to control who is in my round so that the leaderboard is private.

## Outcome

Players can enter a valid join code, choose a display name, join a round, reopen it on the same device, and leave. Hosts can add, rename, remove, and manage participants.

## Depends on

Tasks 01 and 03.

## Context

A player record belongs to one round and includes a display name, playing handicap, membership role, and timestamps. A guest session is scoped to a round and identifies the player for future score writes.

## Constraints

- Display names are unique within a round after trimming and case normalization.
- Players may edit only their own scores.
- Hosts may edit any score and manage membership.
- Players cannot change course, tee, status, or export state.
- Revoking a join code blocks new joins but does not remove existing members.
- A round member may read only the round to which their session belongs.

## Acceptance criteria

- A valid join code allows a player to join.
- An invalid or revoked code is rejected.
- A player cannot read another private round.
- A player cannot change course, tee, player membership, or export state.
- The implementation satisfies `INV-7` and `AC-10`.

## Checks

```text
npm test -- membership
npx playwright test tests/player-join.spec.ts
```

Manually test two players with similar names and verify the duplicate-name rule.

## Out of scope

- Social profiles
- Club membership
- Public player directories
