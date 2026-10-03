# Integrate the GolfCourseAPI Course Source

> **Status:** Implemented, live verification pending API key

## Summary

The course catalog needs a source for real golf course data. Integrate GolfCourseAPI through a server-side proxy so the browser can search for courses and import verified 18-hole course and tee data without exposing the API key.

## Outcome

The catalog now supports:

- Search through `GET /v1/search`.
- Course detail retrieval through `GET /v1/courses/{id}`.
- Import of 18-hole course records.
- Normalization of `tees.male`, `tees.female`, and each tee’s `holes` array into the internal catalog model.
- Tee lengths, colours, course ratings, and slope ratings.
- Clear errors for missing configuration, unavailable API responses, and unsupported course data.

## Depends on

Task 02: Build the Course and Tee-Set Catalog.

## Constraints

- The API token is provided through the server-only `GOLF_COURSE_API_KEY` environment variable.
- The browser must call the local `/api/golf` proxy, never the external API directly.
- Only courses with exactly 18 holes and valid par and stroke-index arrays may be imported.
- Imported data must pass the same internal validation assumptions as manually entered courses.
- Imported courses are stored locally in the current prototype and remain eligible for round snapshots.

## Acceptance criteria

- The catalog exposes search fields for course name, city, and country.
- Search requests use the GolfCourseAPI `/v1/search` endpoint through the local proxy.
- Import requests use the GolfCourseAPI `/v1/courses/{id}` endpoint through the local proxy.
- The imported course displays its tee sets and 18-hole data in the catalog.
- No API key is present in browser JavaScript or browser requests.
- Missing `GOLF_COURSE_API_KEY` produces a clear configuration error.

## Checks

```text
node --check app.js
node --check server.cjs
Invoke-WebRequest http://127.0.0.1:4173/api/golf/courses?name=pebble
```

The local proxy returns HTTP 503 with a clear message until `GOLF_COURSE_API_KEY` is configured. After configuring a valid key, search for a known course, import it, and verify its 18 holes, pars, stroke indexes, tee lengths, rating, and slope. Do not automate polling because the free tier is limited to 35 requests per day.

## Out of scope

- Persisting imported courses in a production database.
- Automatic scheduled course refresh.
- GPS coordinate import.
- Exposing the Golf API key to clients.
