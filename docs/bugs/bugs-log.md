# Central Defect Log & QA Audit — Lab Gréias

> This log applies strict QA triage discipline: **controlled fault injections** (such as `webhook_timeout` in `PAY-003` or deliberate exploratory Shift-Left injections in `docs/evidence/`) are distinguished from **unexpected contract/business defects** (`BUG-PAY-001`).

---

## 1. Active Business / Simulation Defects

### `[BUG-PAY-001]` Improper HTTP 200 / Unhandled HTTP 500 Under `race_condition`
- **Test Case ID:** `PAY-004` (Duplicate or concurrent transaction attempt)
- **Severity:** High
- **Priority:** High
- **Component:** Simulated Pix Payment Endpoint (`Ênio (Dev)`, formerly `Rodrigo (Dev)`)
- **Evidence:**
  - **Google Sheets (Rows 5 & 7, Kinetic Phase):** Returned `HTTP 200` with payment confirmation despite `race_condition` active.
  - **Google Sheets (Row 19, Lab Gréias Retest on `27/11/2026`):** Returned unhandled `HTTP 500` (`"unhandled state during concurrent transaction processing"`).
  - **Markdown Evidence (`docs/evidence/run-2026-11-27T17-15-00_exploratory.md`):** Exploratory run (`gemini-3.6-flash`) returned `HTTP 200` without pessimistic lock, flagged as `MISMATCH` by the JS Test Oracle.
- **Expected Behavior:** Graceful rejection (`HTTP 409 Conflict` or `HTTP 422 Unprocessable Entity`) preventing duplicate processing.
- **Status:** Open — documented in [`docs/bugs/BUG-PAY-001.md`](./BUG-PAY-001.md).

---

## 2. Triage of Controlled Sabotage / Fault Occurrences (Google Sheets `Bug Triggered? = Sim/Yes`)

| Row | Date / Time | Feature / ID | Simulated Fault | HTTP | Classification |
|---|---|---|---|---|---|
| **2** | `02/06/2026` | `Pagamento PIX` | `webhook_timeout` | `500` | **Controlled Fault Injection** (External partner webhook failure) |
| **4** | `27/09/2026` | `Pagamento PIX` | `webhook_timeout` | `500` | **Controlled Fault Injection** (External partner webhook failure) |
| **5** | `27/09/2026` | `Pagamento PIX` | `race_condition` | `200` | **Business Defect** (`BUG-PAY-001` — false positive under concurrency) |
| **7** | `17/10/2026` | `Pagamento PIX` | `race_condition` | `200` | **Recurrent Defect** (`BUG-PAY-001` — recurring false positive) |
| **11** | `17/10/2026` | `PAY-003 \| Pagar` | `webhook_timeout` | `500` | **Controlled Fault Injection** (Expected simulation for `PAY-003`) |
| **19** | `27/11/2026` | `PAY-004 \| Pix Payment via CPF` | `race_condition` | `500` | **Evolved Defect** (`BUG-PAY-001` — shifted from `200` to unhandled `500`, still missing `409`/`422`) |

---

## 3. Parameterized Test Suite Audit (`PAY-001` to `PAY-011`)

### Phase A — Kinetic Parameterized Runs (`17/10/2026`, Rows 8–12)
| Row | ID | Scenario | HTTP | Bug Triggered? | QA Verdict | Notes |
|---|---|---|---|---|---|---|
| **8** | `PAY-005` | Invalid Pix key format | `422` | No | **PASS** | Rejected invalid CPF key format (`11` numeric digits required). |
| **9** | `PAY-001` | Standard payment success | `200` | No | **PASS** | Nominal Pix flow completed. |
| **10** | `PAY-002` | Insufficient account balance | `422` | No | **PASS** | Rejected due to insufficient funds. |
| **11** | `PAY-003` | Temporary gateway unavailability | `500` | Yes (`webhook_timeout`) | **PASS (Simulation)** | Controlled external timeout persisted cleanly. |
| **12** | `PAY-001` | Nominal repeat run | `200` | No | **PASS** | Confirmed nominal response with simulated idempotency key. |

### Phase B — Lab Gréias Batch Completion (`27/11/2026`, Rows 13–19 + Gemini 3 Evidence)
| Row / Artifact | ID | Scenario | HTTP | Bug Triggered? | QA Verdict | Notes |
|---|---|---|---|---|---|---|
| **Row 13** | `PAY-006` | Amount below operational minimum (`<= 0`) | `422` | No | **PASS** | Rejected zero/negative transaction amount. |
| **Row 14** | `PAY-007` | Amount above daily limit | `422` | No | **PASS** | Rejected amount exceeding daily Pix limit. |
| **Row 15** | `PAY-008` | Incomplete request payload | `400` | No | **PASS** | Rejected missing/malformed mandatory fields (`Bad request`). |
| **Row 16** | `PAY-009` | Retry with same idempotency key | `409` | No | **PASS (Contract Note)** | Blocked duplicate transaction (`"No new transaction was created"`). Contract note: catalog initially assumed `200` cached replay, while Ênio enforced `409 Conflict` guard — both prevent double-spending and are accepted in the Test Oracle. |
| **Row 17** | `PAY-010` | Refund or reversal flow | `200` | No | **PASS** | Processed refund/reversal cleanly. |
| **Row 18** | `PAY-011` | Pix key not registered in DICT | `404` | No | **PASS** | Returned `404` for unregistered DICT recipient key. |
| **Row 19** | `PAY-004` | Duplicate / concurrent transaction attempt | `500` | Yes (`race_condition`) | **MISMATCH (`BUG-PAY-001`)** | Unhandled `500` under `race_condition` instead of graceful `409`/`422`. |
| **`docs/evidence/run-2026-11-27T16-32-36_PAY-001.md`** | `PAY-001` | Gemini 3 Flash + JS Test Oracle validation | `200` | No | **PASS** | Pênfredo, Dino, and Ênio all passed JSON schema, type, and HTTP status assertions. |

---

## 4. Exploratory Shift-Left Oracle Catches (`docs/evidence/`)

Starting with the **Test Oracle & 15% per-agent fault margin** upgrade (`27/11/2026`), exploratory runs (`node index.js`) automatically audit all three agent layers:

- **`docs/evidence/run-2026-11-27T16-40-10_exploratory.md` (`gemini-3-flash-preview`):**
  - **Caught by Oracle (`Dino SM — MISMATCH`):** `impacted_endpoints` omitted `"POST /v1/payments"` and `sample_payload_success` contained invalid `payment_method` / non-positive `amount`. Demonstrates early Shift-Left test-data defect detection before Dev execution.
- **`docs/evidence/run-2026-11-27T17-15-00_exploratory.md` (`3.1-flash-lite` / `3.5-flash-lite` / `3.6-flash`):**
  - **Caught by Oracle (`Ênio Dev — MISMATCH`):** Dev agent triggered `race_condition` and returned `HTTP 200` (`"Payment processed without pessimistic lock"`). Demonstrates automated detection of simulated double-spend risk across dedicated per-agent Gemini 3 models.

---

## 5. Infrastructure & Quota Resolutions
- **17/10/2026 (`HTTP 429 — RESOURCE_EXHAUSTED`):** The full sequential run (`node index.js all 60`) halted at `PAY-006` after hitting the `20` requests/day Free Tier limit on `gemini-2.5-flash` (3 calls per scenario).
- **27/11/2026 (Resolution):**
  1. Added CLI range and list batching (`PAY-006..PAY-011`, `PAY-004,PAY-006`) so batches fit comfortably within daily limits.
  2. Migrated off `gemini-2.5-flash` ahead of deprecation and assigned **three distinct Gemini 3 models** (`gemini-3.1-flash-lite` for Pênfredo, `gemini-3.5-flash-lite` for Dino, and `gemini-3.6-flash` for Ênio), tripling effective per-model daily and per-minute quota headroom.