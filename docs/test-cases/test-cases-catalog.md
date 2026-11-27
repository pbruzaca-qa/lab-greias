# Test Case Catalog — Lab Gréias

## 1. Scope & Governance
This catalog defines the traceable test matrix (`PAY-001` to `PAY-011`) and exploratory Shift-Left contract rules for **Lab Gréias** (`lab-greias`).

- **Orchestrator & Agents:** Multi-agent CLI pipeline running **Pênfredo (PO)** (`gemini-3.1-flash-lite`), **Dino (SM / Test Data)** (`gemini-3.5-flash-lite`), and **Ênio (Simulated Dev)** (`gemini-3.6-flash`).
- **Verification & Persistence:** Automated JavaScript **Test Oracle** (validating JSON schemas, data types, and HTTP status expectations), Google Sheets execution log (`A:G`), and Markdown evidence reports in `docs/evidence/`.
- **Scope Boundary:** Lab Gréias simulates fintech SDLC roles, fault injection, and contract verification. Live web/API execution against a real HTTP server is practiced separately in the companion SUT repository **`greias-fintech-qa`** (`https://greias-fintech-qa.vercel.app`).

---

## 2. Parameterized Test Matrix (`PAY-001` to `PAY-011`)

| ID | Scenario / Condition | Test Type | Simulation Input / Sabotage | Oracle Expected HTTP | Observed Behavior | Current Status |
|---|---|---|---|---|---|---|
| **PAY-001** | Standard payment success | Positive / Happy Path | Valid Pix CPF payload (`sabotage: none`) | `200` | `HTTP 200`; nominal settlement confirmed (Rows 9, 12; Gemini 3 evidence) | **Executed / PASS** |
| **PAY-002** | Insufficient account balance | Negative / Business Rule | Insufficient balance (`sabotage: none`) | `422` | `HTTP 422`; rejected due to insufficient funds (Row 10) | **Executed / PASS** |
| **PAY-003** | Temporary gateway unavailability | Resilience / External Fault | Controlled `webhook_timeout` (`sabotage: webhook_timeout`) | `500` or `504` | `HTTP 500`; controlled gateway failure persisted (Row 11) | **Executed / PASS (Controlled Fault)** |
| **PAY-004** | Duplicate or concurrent transaction attempt | Integrity / Concurrency | Concurrent duplicate attempt (`sabotage: race_condition`) | `409` or `422` | `HTTP 200` false positive (Rows 5, 7) → unhandled `HTTP 500` (Row 19) | **Open Defect (`BUG-PAY-001`)** |
| **PAY-005** | Invalid Pix key format | Negative / Data Validation | Malformed CPF Pix key (`sabotage: none`) | `400` or `422` | `HTTP 422`; rejected invalid 11-digit CPF format (Row 8) | **Executed / PASS** |
| **PAY-006** | Amount below operational minimum (`<= 0`) | Negative / Boundary | Amount `<= 0` (`sabotage: none`) | `422` | `HTTP 422`; `"Transaction amount must be greater than zero."` (Row 13) | **Executed / PASS** |
| **PAY-007** | Amount above daily operational limit | Negative / Risk & Compliance | Amount above daily Pix cap (`sabotage: none`) | `422` | `HTTP 422`; `"Transaction amount exceeds the daily operational limit for Pix."` (Row 14) | **Executed / PASS** |
| **PAY-008** | Incomplete request payload | Negative / API Contract | Missing mandatory fields (`sabotage: none`) | `400` | `HTTP 400`; `"Bad request: Mandatory fields are missing or malformed..."` (Row 15) | **Executed / PASS** |
| **PAY-009** | Retry with same idempotency key | Integrity / Idempotency | Repeated `Idempotency-Key` (`sabotage: none`) | `200` or `409` | `HTTP 409`; `"No new transaction was created."` (Row 16 — see contract note below) | **Executed / PASS (Contract Note)** |
| **PAY-010** | Refund or reversal flow | Operational / Post-Settlement | Refund/reversal request (`sabotage: none`) | `200` | `HTTP 200`; `"Payment successfully refunded/reversed."` (Row 17) | **Executed / PASS** |
| **PAY-011** | Pix key not registered in DICT | Negative / Routing | Valid CPF syntax unregistered in DICT (`sabotage: none`) | `404` or `422` | `HTTP 404`; `"Recipient Pix key not registered in DICT."` (Row 18) | **Executed / PASS** |

---

## 3. Exploratory Shift-Left Mode (`node index.js`)

When executed without a `PAY-xxx` target, **Lab Gréias** runs in exploratory mode with an independent **15% fault margin** per agent:

- **Pênfredo (PO):** May omit `business_rules` or required keys in `acceptance_criteria` (requirement defect).
- **Dino (SM):** May omit `"POST /v1/payments"` from `impacted_endpoints` or inject non-positive `amount` in `sample_payload_success` (test-data/planning defect).
- **Ênio (Dev):** May trigger `race_condition` or `webhook_timeout` (implementation defect).

The JavaScript **Test Oracle** audits all three JSON payloads automatically and logs `PASS` or `MISMATCH` into `docs/evidence/`.

---

## 4. Traceability & Contract Notes
- **`BUG-PAY-001` (`PAY-004`):** Linked directly to [`docs/bugs/BUG-PAY-001.md`](../bugs/BUG-PAY-001.md) and [`docs/bugs/bugs-log.md`](../bugs/bugs-log.md).
- **`PAY-009` Contract Alignment (`200` Replay vs. `409` Guard):** Initial planning expected cached `HTTP 200` replay on identical `Idempotency-Key` retries, whereas Row 16 returned `HTTP 409 Conflict` blocking duplicate execution (`"No new transaction was created"`). Both patterns prevent double-spending; the Test Oracle explicitly documents and accepts `[200, 409]`.