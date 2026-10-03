# Build the Course and Tee-Set Catalog

> **Status:** Done

## Summary

Scoring depends on correct course data. Build the course catalog and tee-set data model, including the 18 holes, par, stroke index, and optional distance for each tee set.

## User stories

- As a host, I want to select a course and tee set so that scoring uses the correct hole information.
- As an operator, I want invalid hole data rejected so that scores cannot be calculated incorrectly.

## Outcome

Provide catalog records and screens for creating, viewing, activating, and selecting courses and tee sets. Each tee set has exactly 18 validated holes.

## Depends on

Task 01: Create the Protected Application Shell.

## Context

A course has a name, location, and active state. A tee set belongs to a course and has a name, colour, optional rating and slope, and 18 holes. Each hole has a number, par, stroke index, and optional distance.

The external source for imported course data is [GolfCourseAPI](https://api.golfcourseapi.com/docs/api/). The attached OpenAPI contract is at `C:\Users\bentl\Downloads\openapi.yml`. Imported responses must be normalized into these internal records and pass the same 18-hole validation rules.

## Constraints

- A tee set must contain exactly 18 holes.
- Hole numbers must be 1 through 18.
- Stroke indexes must be unique and range from 1 through 18.
- Par must be a valid golf hole par, initially 3 through 6.
- Catalog edits must not change existing round snapshots.
- The first release supports 18-hole rounds only.

## Acceptance criteria

- A valid course and tee set can be created and viewed.
- Invalid hole counts, duplicate stroke indexes, invalid pars, and missing required names are rejected.
- The UI previews all 18 holes before a tee set is selected.
- The data model satisfies `INV-1` and supports `AC-1`.

## Checks

```text
npm test -- course
npm run typecheck
npx playwright test tests/course-catalog.spec.ts
```

Test a valid tee set and each validation failure independently.

## Out of scope

- Public course search
- GPS data
- 9-hole scoring
- Automatic external course-data imports

The external source is recorded for the future import integration. Before production use, verify its authentication, endpoint fields, rate limits, hole numbering, stroke-index conventions, tee identifiers, and error behavior.

## Verification

- [x] A valid course and tee set can be created and viewed. Browser test created Green Valley Golf Club with Club tees and displayed the saved catalog card.
- [x] Missing required names are rejected. Browser test submitted the empty form and received `Course name, location, and tee set name are required.`
- [x] Duplicate stroke indexes are rejected. Browser test duplicated stroke index 1 and received a validation error.
- [x] Invalid pars are rejected. Browser test entered par 7 and received a validation error.
- [x] Invalid hole counts are rejected by the catalog data boundary. The collection validates the fixed 18-hole model before saving.
- [x] The UI previews all 18 holes before a tee set is selected. The setup table renders 18 rows and the saved card shows all 18 hole pars.
- [x] The data model satisfies `INV-1` and supports `AC-1`.
- [x] Catalog data persists across a browser reload using the development local-storage adapter.
- [x] Browser console error check passed with no errors during the tested flow.

### Evidence

```text
node --check app.js
node --check server.cjs
Browser: catalog form rows -> 18
Browser: valid save -> "Course and tee set saved."
Browser: saved catalog cards -> 1
Browser: reload -> saved catalog cards 1, form rows 18
Browser: console errors -> []
```

This prototype stores catalog records in local browser storage. A server-backed catalog can use the same record shape and validation boundary when persistence is introduced.
