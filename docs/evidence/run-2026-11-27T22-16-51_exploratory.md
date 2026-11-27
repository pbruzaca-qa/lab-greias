# Lab Gréias — Execution & Oracle Evidence Report

- **Generated at:** 2026-11-27T22:16:55.164Z
- **Models:** Pênfredo=`gemini-3.1-flash-lite` | Dino=`gemini-3.5-flash-lite` | Ênio=`gemini-3.6-flash`
- **Target:** `exploratory`
- **Total runs:** 1

## Summary

| Run | Run ID | Case / Mode | Expected HTTP | Observed HTTP | Pênfredo (PO) | Dino (SM) | Ênio (Dev) | Defect Type | Severity | Oracle Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `RUN-20261127-191651-01` | `EXPLORATORY` | 200 (free) | ERR | MISMATCH | MISMATCH | MISMATCH | `runtime_error` | `critical` | **ERROR** |

---

## Run 1: `EXPLORATORY` (exploratory) — `RUN-20261127-191651-01`

- **Timestamp:** 2026-11-27 19:16:51
- **Status:** ERROR
- **Defect Type:** `runtime_error`
- **Severity:** `critical`
- **Oracle Verdict:** **ERROR**
- **Runtime Error:** `{"error":{"code":429,"message":"You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://aistudio.google.com/docs/rate-limits. To monitor your current usage, head to: https://ai.dev/rate-limit. \n* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 20, model: gemini-3.6-flash, description: Generate content requests per day limit exceeded on Free Tier. See https://aistudio.google.com/docs/rate-limits.\nPlease retry in 9h43m4.889253669s.","status":"RESOURCE_EXHAUSTED","details":[{"@type":"type.googleapis.com/google.rpc.Help","links":[{"description":"Learn more about Gemini API quotas","url":"https://aistudio.google.com/docs/rate-limits"}]},{"@type":"type.googleapis.com/google.rpc.QuotaFailure","violations":[{"description":"Generate content requests per day limit exceeded on Free Tier. See https://aistudio.google.com/docs/rate-limits.","quotaMetric":"generativelanguage.googleapis.com/generate_content_free_tier_requests","quotaId":"GenerateRequestsPerDayPerProjectPerModel-FreeTier","quotaDimensions":{"location":"global","model":"gemini-3.6-flash"},"quotaValue":"20"}]},{"@type":"type.googleapis.com/google.rpc.RetryInfo","retryDelay":"34984s"}]}}`
