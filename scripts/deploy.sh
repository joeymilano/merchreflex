#!/usr/bin/env bash
set -euo pipefail
: "${GOOGLE_CLOUD_PROJECT:?Set GOOGLE_CLOUD_PROJECT}"
: "${EVIDENCE_BUCKET:?Set EVIDENCE_BUCKET}"
: "${RUNTIME_SERVICE_ACCOUNT:?Set RUNTIME_SERVICE_ACCOUNT}"
gcloud run deploy merchreflex --source=. --project="$GOOGLE_CLOUD_PROJECT" --region=asia-southeast1 --service-account="$RUNTIME_SERVICE_ACCOUNT" --allow-unauthenticated --min-instances=0 --max-instances=2 --concurrency=8 --memory=512Mi --cpu=1 --timeout=120 --set-env-vars="STORAGE_DRIVER=firestore,GOOGLE_CLOUD_PROJECT=$GOOGLE_CLOUD_PROJECT,GOOGLE_CLOUD_LOCATION=global,GEMINI_MODEL=${GEMINI_MODEL:-gemini-3.8-flash},EVIDENCE_BUCKET=$EVIDENCE_BUCKET,MODEL_BUDGET_USD=25,MAX_DAILY_RUNS=40" --quiet
MERCH_URL=$(gcloud run services describe merchreflex --project="$GOOGLE_CLOUD_PROJECT" --region=asia-southeast1 --format='value(status.url)')
gcloud run services update merchreflex --project="$GOOGLE_CLOUD_PROJECT" --region=asia-southeast1 --update-env-vars="APP_ORIGIN=$MERCH_URL" --quiet
