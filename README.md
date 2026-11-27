# Lab Gréias — Multi-Agent QA Simulation Orchestrator

> Educational QA laboratory. All personas, payment flows, payloads, and defect simulations are 100% fictional.

A Node.js CLI orchestrator that simulates a multi-role fintech software delivery loop using three AI agents (**Pênfredo**, **Dino**, and **Ênio**), an automated JavaScript **Test Oracle**, Shift-Left fault injection, Google Sheets logging, and Markdown evidence generation.

---

## Context & Portfolio Narrative (Lab Gréias → GRÉIAS Fintech)

**Lab Gréias** (originally bootstrapped on Android/Termux as *Kinetic Orchestrator* before moving to Windows/Node.js) serves as **Phase 1** of a structured QA engineering practice environment:

1. **Phase 1 — `lab-greias` (This Repository):** Focuses on SDLC process modeling, requirement and test-data validation, Shift-Left defect injection, automated JSON/HTTP contract assertions (Test Oracle), and strict QA triage separating controlled fault injections from unintended defects (`BUG-PAY-001`).
2. **Phase 2 — [`greias-fintech-qa`](https://github.com/pbruzaca-qa/greias-fintech-qa) ([Live App](https://greias-fintech-qa.vercel.app)):** Instead of building a minimal local Express mock, the simulated fintech SUT evolved into a full-stack digital bank (Next.js, 13 REST endpoints, integer-cents ledger, and Chaos Monkey) for exploratory, API (Postman), and E2E (Playwright) testing.

Both repositories share the same mythological universe (the three Graeae — **Pênfredo**, **Dino**, and **Ênio** — and **Perseu**), while remaining **100% independent** in code and runtime execution.

---

## Multi-Agent & Test Oracle Architecture

Each execution coordinates three sequential agent turns using dedicated **Gemini 3** models via the official `@google/genai` SDK:

| Agent | Role | System Prompt | Default Model | Exploratory Fault Margin |
| --- | --- | --- | --- | --- |
| **Pênfredo** | Product Owner (PO) | `prompts/penfredo_po.txt` | `gemini-3.1-flash-lite` | `15%` (omits business rules or required acceptance criteria) |
| **Dino** | Scrum Master & Test Data (SM) | `prompts/dino_sm.txt` | `gemini-3.5-flash-lite` | `15%` (wrong impacted endpoint or invalid success payload) |
| **Ênio** | Simulated Backend Developer | `prompts/enio_dev.txt` | `gemini-3.6-flash` | `15%` (`race_condition` or `webhook_timeout` injection) |

### Key Capabilities
- **Deterministic Suite Mode (`PAY-001` to `PAY-011`):** Locks Pênfredo and Dino to strict compliant output (`0%` surprise faults) and directs Ênio to simulate exact Pix payment scenarios (`200`, `400`, `404`, `409`, `422`, `500`, `504`).
- **Exploratory Shift-Left Mode (`node index.js`):** Independently rolls a `15%` fault-injection margin across Pênfredo, Dino, and Ênio so QA can practice detecting requirement, test-data, and code defects.
- **Automated JavaScript Test Oracle:** Runs deterministic local assertions (zero extra LLM tokens) validating JSON syntax, mandatory keys, field types, `bug_triggered`/`bug_type` consistency, and `expectedStatuses`.
- **Quota-Safe CLI Batching:** Supports single IDs, ranges (`PAY-006..PAY-011`), comma-separated lists (`PAY-004,PAY-009`), and configurable intervals between runs to stay within Gemini Free Tier limits.
- **Dual Persistence:** Appends execution summaries to **Google Sheets** (`A:G` via Service Account) and saves full Markdown audit reports under `docs/evidence/`.

---

## Prerequisites

- **Node.js** (tested on `v24.21.0` LTS)
- **Google AI Studio API Key** (`GEMINI_API_KEY`)
- **Google Cloud Service Account** (`credentials.json` in project root) + target Spreadsheet ID (`GOOGLE_SHEETS_SPREADSHEET_ID`) for Google Sheets persistence *(optional: if omitted, local execution and `docs/evidence/` reports still work)*

---

## Quick Start

1. **Clone and install dependencies:**
   ```bash
   git clone https://github.com/pbruzaca-qa/lab-greias.git
   cd lab-greias
   npm install
   ```
   *(On Windows PowerShell, use `npm.cmd install`.)*

2. **Configure environment variables (`.env`):**
   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
   GOOGLE_SHEETS_SPREADSHEET_ID=your_google_sheet_id_here

   # Optional per-agent or global model overrides:
   # PO_MODEL=gemini-3.1-flash-lite
   # SM_MODEL=gemini-3.5-flash-lite
   # DEV_MODEL=gemini-3.6-flash
   # GEMINI_MODEL=gemini-3-flash-preview
   ```

3. **Place your Google Service Account key** as `credentials.json` in the project root (both `.env` and `credentials.json` are excluded by `.gitignore`).

4. **Verify syntax without spending API quota:**
   ```bash
   node --check index.js
   ```

---

## Usage Examples

- **Exploratory Shift-Left run (15% fault margin per agent):**
  ```bash
  node index.js
  ```
- **Single deterministic scenario (`PAY-001` to `PAY-011`):**
  ```bash
  node index.js PAY-004
  ```
- **Range batch with 65-second interval between runs (quota-friendly):**
  ```bash
  node index.js PAY-006..PAY-011 65
  ```
- **Custom list of scenarios:**
  ```bash
  node index.js PAY-004,PAY-009 65
  ```
- **Full suite (`PAY-001` through `PAY-011`):**
  ```bash
  node index.js all 65
  ```

---

## Repository Structure & QA Artifacts

- [`index.js`](./index.js) — CLI entrypoint, multi-agent orchestrator, JS Test Oracle, Sheets logger, and evidence writer
- [`prompts/`](./prompts) — Agent system prompts (`penfredo_po.txt`, `dino_sm.txt`, `enio_dev.txt`)
- [`docs/test-cases/test-cases-catalog.md`](./docs/test-cases/test-cases-catalog.md) — Traceable matrix (`PAY-001`–`PAY-011`) and exploratory rules
- [`docs/bugs/bugs-log.md`](./docs/bugs/bugs-log.md) — Central QA audit log separating controlled faults from `BUG-PAY-001` and Oracle catches
- [`docs/bugs/BUG-PAY-001.md`](./docs/bugs/BUG-PAY-001.md) — Detailed defect report for concurrency failure under `race_condition`
- [`docs/evidence/`](./docs/evidence) — Generated Markdown execution & Test Oracle evidence reports

---

## License

This project is licensed under the **GNU General Public License v3.0 (GPLv3)** — see [`LICENSE`](./LICENSE) for details.