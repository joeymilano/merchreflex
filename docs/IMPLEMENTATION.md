# Implementation record

The approved plan is implemented in a new repository, independent of Finfold and the portfolio site.

## Scope

One synthetic Commuter One product, three editable fields, live Gemini text/image/tool calls, separate semantic checking, human approval, transactional publication, server-rendered storefront verification and append-only rollback. Desk Light and Travel Mug are evaluation fixtures, not additional UI pages.

## Architecture

Browser → Next.js on Cloud Run → Gemini through @google/genai. Firestore stores isolated sessions, immutable evidence history, runs, approved patches, versions, command receipts and verification reports. Cloud Storage holds private uploaded PNGs after decoding, stripping metadata and normalizing dimensions. The included product image is AI-generated and is labelled throughout; a real original photograph remains a human input.

No model tool can publish. Exposed tools read current evidence and inspect the page. Structured output is parsed with Zod. A separate model request validates entire replacement fields, including statements omitted from a candidate's claim list. Same-model validation is not an independent guarantee of truth. Human review remains required.

## Integrity boundaries

- All operations are scoped to a 24-hour HttpOnly session cookie. The browser has no Firestore credentials.
- Writes require exact Origin and a session CSRF token.
- Approval binds patch hash, page version, evidence revision and session for ten minutes.
- Evidence changes invalidate unpublished patches and their approvals.
- Publication and rollback use Firestore transactions. Idempotency receipts are stored atomically with the page version.
- A restored page is a new version; previous versions remain in history.
- Model calls never occur inside transaction callbacks.
- Storefront verification fetches the server-rendered page over HTTP and compares its embedded content snapshot against the persisted version. Browser visibility is tested separately. This verifies served content, not a reduction in returns or customer confusion.
- In-flight tasks have a 90-second deadline and execution identity. Interruption, changed inputs, expired execution or validation failure cannot produce an approvable patch.

## Limits

One SKU, 20 feedback records, two JPEG/PNG images up to 5 MB each, 12 runs per session, one active run per session, 40 page versions. At most eight model calls and six read-only tool executions per run. One correction attempt. Model spending is reserved centrally before each run; no private credentials are used in the client. Global daily run and session limits apply.

## Known boundaries

- A single-session Firestore document deliberately trades large-catalog scalability for a small, auditable prototype. The store rejects documents above 850 KB. Production would separate runs, versions and evidence into subcollections.
- Human interview and usability findings are pending; synthetic tests are not merchant validation.
- No Shopify integration, commercial transaction, checkout, real inventory or customer-data ingestion is included.
- Same-model semantic checking can share correlated errors. All proposed new facts require human review.
- A public demo can consume shared quota; it does not have production anti-abuse guarantees.
- Budget alerts are not spending caps. App quotas and instance limits reduce, but do not mathematically guarantee, total infrastructure spend.
