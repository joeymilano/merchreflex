#!/usr/bin/env bash
set -euo pipefail
: "${GOOGLE_CLOUD_PROJECT:?Set GOOGLE_CLOUD_PROJECT}"
: "${EVIDENCE_BUCKET:?Set EVIDENCE_BUCKET}"
: "${RUNTIME_SERVICE_ACCOUNT:?Set RUNTIME_SERVICE_ACCOUNT}"
: "${APP_ORIGIN:?Set the exact public browser origin; do not replace it with a Cloud Run alias}"
: "${GEMINI_API_KEY:?Set GEMINI_API_KEY (free-tier AI Studio key)}"
# Free-tier architecture: billing stays UNLINKED day to day (that is what keeps
# the Gemini API key on the free tier and spend at zero). Secret Manager cannot
# mount secrets without billing, so the key is baked as an env var instead.
# Deploying itself requires billing: open a short link window, deploy, then
# unlink again right after. Cloud Run serving and Firestore work unlinked;
# GCS evidence uploads do NOT (documented limitation).
# Deploy without moving public traffic. Smoke-test the candidate, then promote
# its explicit revision using gcloud run services update-traffic.
gcloud run deploy merchreflex --source=. --project="$GOOGLE_CLOUD_PROJECT" --region=asia-southeast1 --service-account="$RUNTIME_SERVICE_ACCOUNT" --allow-unauthenticated --min-instances=0 --max-instances=2 --concurrency=8 --memory=512Mi --cpu=1 --timeout=120 --no-traffic --tag=candidate --set-env-vars="STORAGE_DRIVER=firestore,GOOGLE_CLOUD_PROJECT=$GOOGLE_CLOUD_PROJECT,GOOGLE_CLOUD_LOCATION=global,GEMINI_MODEL=${GEMINI_MODEL:-gemini-3.8-flash},EVIDENCE_BUCKET=$EVIDENCE_BUCKET,MODEL_BUDGET_USD=25,MAX_DAILY_RUNS=40,APP_ORIGIN=$APP_ORIGIN,GEMINI_API_KEY=$GEMINI_API_KEY" --quiet
