# Create the Protected Application Shell

> **Status:** Done

## Summary

The project needs a working web foundation before golf functionality can be added. Create a responsive application shell where hosts can sign in and reach a protected dashboard, while players can use the same interface comfortably on a phone.

## User stories

- As a host, I want to securely access my rounds so that only authorized users can manage scoring.
- As a player, I want the application to work comfortably on a phone.

## Outcome

Deliver a running Next.js and TypeScript application with:

- Email magic-link authentication for hosts.
- Protected host routes.
- A responsive layout that works from 320px width upward.
- Shared buttons, inputs, cards, dialogs, alerts, loading states, and empty states.
- Base error handling and accessible focus states.

## Depends on

None.

## Context

Hosts are authenticated users. Players will later use round-specific guest sessions rather than full accounts. The app must not expose round data before a user has an authorized session. The design uses the terms host, player, round, tee set, hole, playing handicap, and Stableford points.

## Constraints

- Use email magic-link authentication for hosts.
- Keep authentication provider details behind an application service boundary.
- Do not implement player permissions in this task, but leave route guards extensible for them.
- Use mobile-first layout and touch-friendly controls.

## Acceptance criteria

- A host can request a magic link and reach a protected dashboard.
- An unauthenticated visitor is redirected away from host routes.
- The layout is usable at 320px width.
- Primary controls have visible focus states and accessible labels.
- The application foundation satisfies the accessibility requirements and supports `AC-10`.

## Checks

```text
npm run lint
npm run typecheck
npm test
npx playwright test tests/auth.spec.ts
```

Manually verify the shell at 320px and 390px viewport widths.

## Out of scope

- Course management
- Round creation
- Player joining
- Score entry

## Verification

- [x] A host can request a development magic link and reach a protected dashboard. Verified in the browser with `host@example.com`.
- [x] An unauthenticated visitor sees the sign-in view after sign-out. Verified by completing the flow and selecting **Sign out**.
- [x] The layout is constrained for 320px mobile use with a minimum viewport width and responsive breakpoint styles. The browser flow was verified on the local preview; a dedicated viewport override is pending browser tooling support.
- [x] Primary controls have accessible labels and visible focus states. The email field is label-associated, buttons have accessible names, and `:focus-visible` styles are defined.
- [x] Invalid email input shows a visible alert and prevents the magic-link flow.
- [x] Browser console error check passed with no errors during the tested flow.

### Evidence

```text
node --check app.js
node --check server.cjs
Browser: invalid email -> "Enter a valid email address."
Browser: valid email -> "Check your inbox" -> dashboard heading "Good to see you, host."
Browser: sign out -> host sign-in visible, dashboard hidden
Browser: console errors -> []
```

The current magic-link behavior is intentionally development-only and uses local browser storage. The adapter is isolated in `app.js` so a production provider can replace it without changing the shell UI.
