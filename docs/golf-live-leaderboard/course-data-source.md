# Course Data Source

The external source for golf course and tee-set data is GolfCourseAPI, documented here:

[GolfCourseAPI documentation](https://api.golfcourseapi.com/docs/api/)

The attached OpenAPI contract is retained as the implementation reference at `C:\Users\bentl\Downloads\openapi.yml`.

Use this documentation when implementing course catalog imports and course lookup. Imported data must be normalized into the application’s internal `Course`, `TeeSet`, and `Hole` records and pass the existing 18-hole validation rules.

The integration uses `GET https://api.golfcourseapi.com/v1/search` for search and `GET https://api.golfcourseapi.com/v1/courses/{id}` for course details. Search uses the required `search_query` parameter. The detail response supplies `tees.male` and `tees.female`; each tee supplies `holes` with `par`, `yardage`, and `handicap`, plus `course_rating`, `slope_rating`, and `number_of_holes`. The server sends `GOLF_COURSE_API_KEY` as a Bearer token.

The external API is a source for catalog data only. A created round must continue to store a frozen tee-set snapshot so later API changes cannot alter an active or historical round.

The current prototype requires the server-only `GOLF_COURSE_API_KEY` environment variable. The free tier is expected to allow 35 requests per day, so search and import actions must remain explicit and must not poll automatically.

## Integration status

- [x] Server-side proxy for course search and course details.
- [x] Bearer token kept out of browser code.
- [x] Search and import UI in the course catalog.
- [x] Normalization of 18-hole par, stroke index, tee length, rating, slope, tee name, and tee colour.
- [x] Clear configuration error when `GOLF_COURSE_API_KEY` is missing.
- [ ] Live API verification after a valid API key is configured.
