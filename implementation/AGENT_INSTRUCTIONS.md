# Coding Agent Instructions

## Working agreement

You are completing an existing application, not generating a replacement. Inspect the current implementation before changing it and reuse established services, routes, schemas, and components when they are sound.

## Required behavior

- Lead with the root cause when fixing defects.
- Prefer end-to-end vertical slices over disconnected scaffolding.
- Keep backend authorization authoritative.
- Use canonical migrations for schema changes.
- Add migrations only for proven application requirements.
- Make migrations safe on clean and existing databases.
- Preserve idempotency for payments, orders, ledger entries, sync events, and webhooks.
- Fail closed when an external integration is incomplete or misconfigured.
- Provide accessible loading, empty, error, forbidden, and expired-session states.
- Remove or disable visible controls that have no implemented behavior.
- Never leave navigation pointing to nonexistent routes.

## Definition of done for a work item

A work item is done only when:

- Production code is implemented.
- Validation and error behavior are implemented.
- Authentication and authorization are covered.
- Database changes have a canonical migration when required.
- Meaningful automated tests pass.
- Adjacent regression tests pass.
- Typecheck/build pass.
- Browser behavior is verified for UI work.
- Documentation and status are updated.

## Stop conditions

Stop and document a blocker instead of guessing when work requires:

- A market/country decision
- Tax or legal interpretation
- Production provider credentials
- Destructive data migration without an approved policy
- A material product workflow not defined in the requirements
- Expanding the release scope beyond the active phase

## Security rules

- Never log passwords, OTPs, tokens, payment secrets, or unmasked sensitive data in production.
- Use HTTP-only secure cookies in production.
- Protect cookie-authenticated mutations against CSRF.
- Verify payment state server-to-server.
- Never fulfill an order from client callback state alone.
- Enforce store and organization scope in database-backed service logic.
- Audit sensitive mutations and permission denials.

## UI rules

- Use the real session identity; do not hard-code staff, store, role, or shift data.
- Use one authoritative backend catalog.
- Make every visible button perform a real action or clearly disable it.
- Do not create sidebar links until the destination route exists.
- Display actionable backend errors without exposing internal stack traces.

