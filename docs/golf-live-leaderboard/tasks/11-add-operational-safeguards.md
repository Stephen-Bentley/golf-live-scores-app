# Add Operational Safeguards

## Summary

Live scoring uses repeated writes, realtime connections, authentication, and file generation. Add observability, rate limits, retention, and secure download behavior so the service can be operated safely.

## User stories

- As an operator, I want failed saves and exports to be visible so that issues can be diagnosed.
- As a host, I want accidental or abusive requests limited without losing accepted scores.

## Outcome

Add structured logs, score-save latency metrics, realtime delivery metrics, export duration and failure metrics, reconnect metrics, rate limits, round-size limits, export request limits, error reporting, short-lived download links, and configurable retention.

## Depends on

Tasks 01 through 10.

## Context

The initial operating limits are 100 players per round, 10 score writes per player per minute, 5 export requests per round per hour, and 12-month default round retention.

## Constraints

- Rate-limited requests return a clear retryable response.
- Rate limiting must not overwrite accepted scores.
- Sensitive data must not appear in ordinary logs.
- Export links expire.
- Retention must not remove active or recently completed rounds unexpectedly.

## Acceptance criteria

- Metrics are emitted for score saves, realtime delivery, exports, and reconnects.
- Rate limits return an explicit retryable response.
- Export links expire.
- Retention behavior is documented and testable.
- No sensitive data appears in ordinary logs.

## Checks

```text
npm run lint
npm run typecheck
npm test
```

Also manually review logs, authorization failures, rate-limit behavior, and expired download links.

## Out of scope

- Multi-region deployment
- Full analytics dashboard
- Billing and subscription management
