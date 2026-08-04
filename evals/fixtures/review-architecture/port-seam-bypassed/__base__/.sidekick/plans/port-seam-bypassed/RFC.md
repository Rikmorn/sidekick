---
slug: port-seam-bypassed
created: 2026-08-01
status: locked
---

# Dunning notices for overdue accounts

Chase unpaid invoices with a sequence of reminder emails.

## Goals & non-goals

- **g1:** An overdue account receives reminders on a fixed schedule.
- **g2:** The dunning schedule is testable without a mail server — the test
  suite asserts on captured messages, not on SMTP.

Non-goals: bounce handling; localisation.

## Decisions

- **D-01:** Reminder cadence lives in the service (day 3, 7, 14). Changing it
  is a service change, not a template change.

## Architecture

Ports and adapters. The seam between policy and I/O is explicit:

- **`src/ports/`** declares the interfaces the services depend on
  (`MailerPort`). These are the only I/O shapes a service knows about.
- **`src/adapters/`** holds concrete implementations (`SmtpMailer`) — the
  vendor SDKs, the sockets, the retries.
- **`src/services/`** contains policy. A service takes its collaborators as
  constructor arguments typed as ports. It imports from `src/ports/`, and does
  not import from `src/adapters/` — that import is what would make the policy
  untestable without a real mail server, so the seam is the whole point.
- **`src/main.ts`** is the composition root and the one module that constructs
  adapters and injects them.

## Questions

(none)

## Risks

- Two indirection hops between a service and a socket. Accepted — g2 is what
  buys it.
