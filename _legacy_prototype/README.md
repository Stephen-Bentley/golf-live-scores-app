# Fairway Live

This is the first implementation slice of the golf live leaderboard. It provides the mobile-first application shell and a development-only magic-link flow for host authentication.

## Run locally

Open `index.html` in a browser. No package installation is required for this foundation slice.

The authentication adapter in `app.js` uses local browser storage so the flow can be exercised before a production authentication provider is connected. The adapter is intentionally isolated behind `requestMagicLink`, `completeMagicLink`, `getSession`, and `signOut`.

## GolfCourseAPI integration

The course catalog can search and import 18-hole courses through GolfCourseAPI. Copy `.env.example` to `.env` and set the server-only `GOLF_COURSE_API_KEY` before starting `server.cjs`. The browser calls the local `/api/golf/courses` proxy, so the Bearer token is never exposed to the client.

## Task 1 status

- [x] Host can request a development magic link.
- [x] Host can open the development link and reach the protected dashboard.
- [x] Unauthenticated visitors see the sign-in view.
- [x] Layout supports 320px mobile width.
- [x] Primary controls have accessible labels and visible focus states.
