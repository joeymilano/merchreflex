# Measured validation — 13 October 2026

These are execution results, not a claim of semantic accuracy, merchant adoption or business impact. All evaluation product records are synthetic. Human semantic grading is pending.

## Current code

- Cloud Run revision: `merchreflex-00008-jul`, 100% traffic.
- Model: `gemini-3.8-flash`, global; LOW thinking.
- Prompt/config fingerprint: `4baa4a8ec4ea1047b7434a75925ddded503d74809a12a5e9bc88c114cc92ff0c`.
- Frozen case fingerprint: `44b0d074a4e861db21743204cfaaf97db64d818a11c5c15ec48ff2b1aef3a7fb`.
- 23 local domain/integrity tests pass. Build and typecheck pass.
- The 12 holdout cases have NOT been evaluated or used for prompt tuning.

## Pending revision (13 October, later session — designed, not yet deployed)

- Cost decision: model calls move from billable Vertex AI to the free-tier Gemini API using an AI Studio API key, per the owner's instruction that all Google service usage stays within free quota. A gcloud-created project API key was tested and rejected by `generativelanguage.googleapis.com` (`API_KEY_INVALID`), consistent with Gemini API keys having to be minted from AI Studio. The rejected key was deleted. Configuration is dual-mode: `GEMINI_API_KEY` selects the Gemini API; its absence falls back to Vertex ADC, so the change is reversible.
- Reliability: `lib/agent.ts` now retries transient model errors (HTTP 429/500/502/503/504 or `UNAVAILABLE`/`RESOURCE_EXHAUSTED`/`overloaded` messages) with at most one retry per call and two per run, 700 ms/1400 ms backoff, only when at least 20 s remain before the deadline. Retried attempts consume the same per-run model-call budget, and `retries`/`retryNotes` are persisted on both completed and failed runs. Control-flow, abort and non-transient errors are never retried. Four unit tests cover classification and the deadline-aware decision.
- Prompt/config version moves to `2026-10-13.5` and the fingerprint now includes the endpoint (`vertexai` or `gemini-api-key`), so runs record which endpoint produced them. Prompts themselves are unchanged.
- 27 local tests pass (23 prior + 4 retry). Build and typecheck pass. Vertex-based history above is preserved but MUST NOT be pooled with results from the free-tier endpoint revision.

## Free-tier billing findings (13 October, evening session)

- The owner's AI Studio account is a **prepay-credits account**. A `merchreflex-cup-2026` AI Studio key works on the **free tier only while the project has billing unlinked**; with billing linked the key immediately moves to paid tiers and fails with `402 prepayment credits are depleted` (`RESOURCE_EXHAUSTED`), since no credits were ever purchased. Verified experimentally in both directions.
- A gcloud key was rejected (`API_KEY_INVALID`) — keys must be created in AI Studio (sources: Google AI Dev Forum / Cloud Community reports; `ai.google.dev/gemini-api/docs/billing`).
- Compatibility smoke on the free tier PASSED: text, inline image, function calling (`ANY` mode) and `responseJsonSchema` with MODEL_SCHEMA all work on `gemini-3.8-flash` via the key. One transient 503 during schema smoke was retried manually and passed — this is exactly the failure class the retry change covers.
- 402 depleted-credit errors match the `RESOURCE_EXHAUSTED` message pattern and were initially misclassified as retryable; `isTransientModelError` now short-circuits on "credits are depleted" (test added; 28 local tests pass).
- **Structural conflict, empirically proven**: Cloud Run serving, deploys and GCS require billing linked; the Gemini free tier requires billing unlinked. After unlinking, the public service returned platform 503/429 within minutes. Pure-$0 with the current stack is therefore impossible.
- Reconciliation adopted (commit `61a5752`, revisions through `merchreflex-00012-his`): billing stays **linked**; the key is deployed as a plain env var (Secret Manager binding removed — it cannot boot unlinked anyway); the billable Vertex path is taken off traffic (00008) and the `aiaplatform.googleapis.com` API is disabled outright as a hard spend guard. Serving/Firestore run inside Always Free quotas (¥0); model calls fail safely with 402 (no retry, honest error) until prepaid credits exist. **The owner's remaining decision: purchase AI Studio prepaid credits (minimum $5) to reactivate the model path — estimated remaining-acceptance usage under ~$1 and judging-period usage ~$1–2 — or provide an alternative free-quota account. No credits were purchased on the owner's behalf.**
- GCS evidence uploads bill fractions of a cent on the linked account (asia-southeast1 has no free storage); all other paths are ¥0 at demo scale.
- Deployment procedure for future revisions: short billing-link window → deploy + traffic switch → verify; aiplatform stays disabled.

## Latest development evaluation

[Raw paired results and summary](../eval/results/2026-10-13-development/summary.json). Same model, evidence and safe-generation prompt; baseline uses a single response without the workflow's tools and additional validator. Compare content quality separately from execution features.

| Measure | Workflow | Single-response baseline |
|---|---:|---:|
| Cases attempted | 18 | 18 |
| Executions completed | 18 | 17 |
| Executions failed | 0 | 1 |
| p50 duration | 11.453 s | 5.856 s |
| p95 duration, including failures | 75.246 s | 40.359 s |
| Estimated model spend | USD 0.256188 | USD 0.1224195 |
| Human accuracy grading | Pending | Pending |

These timings come from the local evaluation runner using the live model, not the Cloud Run user journey. The slower cases can approach the 90-second ceiling. Earlier development rounds are preserved in [history](../eval/results/history/): workflow completed 11/18 and then 15/18. Across versions there are 54 workflow attempts; do not pool these as a final-version reliability score. The latest version has 18 development attempts.

## Deployed checks

- Candidate revision passed the full API smoke, including isolation, Origin, CSRF, approval, publish, replay, served-page verification and rollback: [record](../eval/results/release/candidate-v4.json).
- After promotion, the public URL passed the same smoke: [record](../eval/results/release/release-v4.json). Live model run 16.541 s; complete publish/verify/rollback journey 20.735 s.
- In the live browser, dimension supplementation and reassessment produced a supported 32 × 23 × 3 cm FAQ and a device-measurement instruction, without a universal 16-inch compatibility promise. [Screenshot](images/dimension-reassessment-v4.jpg). This browser patch was left for review; it was not published.
- Prior live browser sessions exercised publication, storefront inspection, verification and restoration. Those screenshots remain in local `output/screenshots/`.
- A separate source-flip/upload smoke on the current public revision failed during its FIRST model run with `SERVICE_UNAVAILABLE`, before evidence mutation or upload assertions. This is a real failure. Source-flip and private-upload end-to-end acceptance remains incomplete; local domain coverage is not a substitute.
- Five consecutive public end-to-end passes have NOT been achieved. Earlier revision 00005 passed three and then failed; the current revision has one public smoke pass plus one candidate pass. Do not count the candidate as a second public consecutive pass.

## Remaining acceptance

Human-grade changed facts and classifications, run the untouched holdout once under a frozen version, complete five consecutive public journeys, measure final-version latency with at least 30 runs, finish source-change and irrelevant-feedback invariance tests, and conduct two non-developer task tests including a merchant/operator. Keep failures visible. No interview, video, submission receipt or billing reconciliation has been completed by these tests.
