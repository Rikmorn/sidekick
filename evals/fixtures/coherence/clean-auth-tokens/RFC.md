---
slug: clean-auth-tokens
created: 2026-06-20
status: draft
---

## Goals & non-goals

- g1: issue short-lived access tokens with refresh.
- Non-goal: supporting third-party OAuth providers.

## Architecture

The auth service issues a 15-minute JWT access token plus an opaque refresh
token stored server-side. Clients exchange the refresh token for a new access
token; refresh tokens are revocable by deleting the server-side record.

## Decisions

- D-01: access tokens are stateless 15-minute JWTs.
- D-02: refresh tokens are opaque and server-side so they can be revoked.

## Questions

- What refresh-token lifetime balances UX and risk?

## Risks

- A leaked access token is valid until it expires (up to 15 minutes).
