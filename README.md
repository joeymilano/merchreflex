# MerchReflex

**Fix the page. Not just the ticket.**

An evidence-grounded product-page repair prototype for AI Builder Cup 2026. New code built independently for this competition. All product facts and feedback in the demonstration are synthetic; the included image is AI-generated.

## What works

- Live Gemini text and image interpretation with read-only tool calls
- Product-page, missing-information, source-conflict, quality and fulfillment triage
- Minimal, source-linked changes to description, image caption and FAQ
- Separate semantic verification and deterministic permission checks
- Merchant-confirmed new evidence invalidating old approvals
- Human approval bound to the patch, page version and evidence revision
- Atomic publication, idempotency receipts, served-page verification and append-only rollback
- Per-visitor isolated sessions; no production store connection

## Run locally

Requires Node.js 22+, a Google Cloud project with billing, Cloud Run, Firestore, Cloud Storage and model APIs, and local Application Default Credentials.

```sh
npm ci
cp .env.example .env.local
gcloud auth application-default login
npm run dev
```

Open http://localhost:3147. Configure `APP_ORIGIN` to exactly match the address used. Production requires `STORAGE_DRIVER=firestore`. Development can omit it for single-process file storage under ignored `.data/`; model calls are still live and there is no canned AI fallback.

```sh
npm test
npm run build
npm run typecheck
```

Tests inject an in-memory store; they do not consume model credits. Run the three model smoke tests explicitly with `npx tsx scripts/smoke.ts`. `npm run eval` performs real, billed model evaluations when cloud environment variables are set. Do not publish evaluator outputs as human-verified accuracy.

## Deploy

Use the included Dockerfile and `scripts/deploy.sh`. Runtime uses a dedicated service account with Firestore data access, model access, and object access only to the private evidence bucket. No service-account keys are required.

Set the deployed service URL as `APP_ORIGIN`, and keep the public app accessible during judging. The application has a global model budget and daily quotas, but cloud billing alerts are not hard spending caps. Inspect actual billing daily.

## Documentation

- [Architecture and boundaries](docs/IMPLEMENTATION.md)
- [Research protocol](docs/RESEARCH.md)
- [Demo script](docs/DEMO-SCRIPT.md)
- [Submission checklist](docs/SUBMISSION.md)
- [Evaluation cases](eval/cases.json)

## Limitations

Same-model checking can repeat the original model's errors; a human must verify changed facts. Served-page checks prove that approved content is returned, not that customers understand it or returns decrease. Interviews, human semantic grading and non-developer usability testing are separate tasks. Model errors and budget limits are visible and do not silently switch to replay.

The prototype deliberately limits scale to one SKU per session and 12 runs. A production product would split session records into subcollections, add durable queued work, merchant authentication, stronger abuse prevention and a commerce connector.
