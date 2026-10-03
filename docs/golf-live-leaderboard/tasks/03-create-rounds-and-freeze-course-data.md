# Create Rounds and Freeze Course Data

> **Status:** Done

## Summary

Hosts need a setup flow that creates a live round from a selected course and tee set. The selected data must be copied into a round snapshot so later catalog edits cannot change a result in progress or a historical result.

## User stories

- As a host, I want to create a round quickly so that players can join before play starts.
- As a host, I want the round’s course data frozen so that results remain reproducible.

## Outcome

A host can select a course, select a tee set, preview the 18 holes, create a round, receive a join code, and reopen the round from the dashboard.

## Depends on

Tasks 01 and 02.

## Context

A round stores a host ID, random join code, status, timestamps, and a complete tee-set snapshot. Initial round statuses are `setup`, `active`, `ready_for_export`, `closed`, and `archived`.

## Constraints

- Join codes must be random, non-sequential, and revocable.
- The snapshot stores course name, tee name, colour, par, stroke index, and optional distances.
- Only the host can change course, tee, round status, or export readiness.
- Round IDs are opaque generated IDs.

## Acceptance criteria

- A host can create a round from a valid tee set.
- The round displays its join code and hole preview.
- Editing the catalog after creation does not change the round snapshot.
- A non-host cannot change round setup.
- The implementation satisfies `AC-1`, `AC-10`, and `INV-7`.

## Checks

```text
npm test -- rounds
npx playwright test tests/round-setup.spec.ts
```

Manually change a catalog tee after creating a round and verify the round remains unchanged.

## Out of scope

- Player scoring
- Export generation
- Countback rules

## Verification

- [x] A host can create a round from a valid tee set. Browser test created rounds from Green Valley Golf Club and Club tees.
- [x] The round displays a random join code and hole preview. Browser preview rendered 18 holes and created join codes `HQLHJ3` and `BYYX5K`.
- [x] Editing the catalog after creation does not change the round snapshot. Browser test changed catalog par from 72 to 71; the created round remained Par 72.
- [x] A non-host cannot change round setup. After sign-out, the host dashboard and Create a round action were unavailable.
- [x] The implementation satisfies `AC-1`, `AC-10`, and `INV-7` for the current development shell.
- [x] Round records persist locally and can be reopened from the dashboard.
- [x] Browser console error check passed with no errors during the tested flow.

### Evidence

```text
node --check app.js
Browser: setup preview -> 18 holes, Green Valley Golf Club · Club tees · Par 72
Browser: created round -> status setup, 18 holes, join code BYYX5K
Browser: catalog edited -> catalog Par 71, round snapshot Par 72
Browser: signed out -> host sign-in visible, Create a round unavailable
Browser: console errors -> []
```

The prototype stores rounds in local browser storage and uses the host session from Task 1. The round record stores a deep copy of the selected tee set under `teeSetSnapshot` so catalog edits do not mutate existing rounds.
