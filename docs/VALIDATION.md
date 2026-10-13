# Measured validation — 13 October 2026

These are execution results, not a claim of semantic accuracy, merchant adoption or business impact. All evaluation product records are synthetic. Human semantic grading is pending.

## Current code

- Cloud Run revision: `merchreflex-00008-jul`, 100% traffic.
- Model: `gemini-3.8-flash`, global; LOW thinking.
- Prompt/config fingerprint: `4baa4a8ec4ea1047b7434a75925ddded503d74809a12a5e9bc88c114cc92ff0c`.
- Frozen case fingerprint: `44b0d074a4e861db21743204cfaaf97db64d818a11c5c15ec48ff2b1aef3a7fb`.
- 23 local domain/integrity tests pass. Build and typecheck pass.
- The 12 holdout cases have NOT been evaluated or used for prompt tuning.

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
