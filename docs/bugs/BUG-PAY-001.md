# BUG-PAY-001 — Improper HTTP 200 / Unhandled HTTP 500 Under `race_condition` Simulation

## Metadata
- **Record ID:** `BUG-PAY-001`
- **Severity:** High
- **Priority:** High
- **Status:** Open (Retested — Behavior Evolved)
- **Related Test Case:** `PAY-004` (Duplicate or concurrent transaction attempt)
- **Component:** Simulated Pix Payment Endpoint (`prompts/enio_dev.txt`, formerly `rodrigo_dev.txt`)
- **Observed Scenario:** Simulation flagged with `bug_triggered = true` and `bug_type = "race_condition"`

## Description
Under high-concurrency simulation (`race_condition`), the simulated backend developer agent fails to enforce concurrency locking or idempotent rejection (`HTTP 409 Conflict` or `HTTP 422 Unprocessable Entity`):
1. **Stage 1 — Legacy Kinetic Phase (Google Sheets Rows 5 & 7):** Returned a silent false-positive **`HTTP 200`** with `"Pagamento processado com sucesso."`, exposing a classic double-spend risk.
2. **Stage 2 — Lab Gréias Deterministic Retest (Google Sheets Row 19, `27/11/2026`):** Under updated prompt rules (`enio_dev.txt`), the endpoint no longer returned a silent `200`, but crashed into an unhandled **`HTTP 500`** (`"Internal Server Error: A race condition was triggered, leading to an unhandled state during concurrent transaction processing."`).
3. **Stage 3 — Exploratory Multi-Model Run (`docs/evidence/run-2026-11-27T17-15-00_exploratory.md`):** Under the 15% exploratory Dev fault margin (`gemini-3.6-flash`), Ênio reproduced the silent **`HTTP 200`** (`"Payment processed without pessimistic lock. Potential duplicate transaction."`), caught automatically as `MISMATCH` by the JavaScript Test Oracle.

## Context & Scope Limits
This defect documents simulated agent behavior in **Lab Gréias** (`lab-greias`). It demonstrates QA triage, contract validation, and concurrency risk modeling — it does not represent a failure in a live production banking API.

## Observed Behavior vs. Expected Behavior
- **Observed:**
  - `HTTP 200` silent approval without pessimistic lock (Rows 5, 7, and exploratory run `2026-11-27T17-15-00`).
  - `HTTP 500` unhandled concurrency state (Row 19, `PAY-004` deterministic retest).
- **Expected (Catalog & Oracle Contract):**
  - Graceful concurrency / duplicate transaction rejection with **`HTTP 409 Conflict`** or **`HTTP 422 Unprocessable Entity`** and zero duplicate debit.

## Risk
- **Financial Integrity Risk:** Silent `HTTP 200` under concurrent requests leads to duplicate ledger debits / double-spending.
- **Resilience Risk:** Unhandled `HTTP 500` exposes unstable transaction states instead of deterministic conflict handling.