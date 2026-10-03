#!/usr/bin/env bash
set -euo pipefail

missing=0
for name in E2E_AUTH_EMAIL E2E_AUTH_PASSWORD E2E_ACADEMY_ID E2E_ACADEMY_B_ID E2E_ATHLETE_ID E2E_ADMIN_EMAIL E2E_ADMIN_PASSWORD E2E_COACH_EMAIL E2E_COACH_PASSWORD E2E_FAMILY_EMAIL E2E_FAMILY_PASSWORD E2E_ATHLETE_EMAIL E2E_ATHLETE_PASSWORD E2E_SUPER_ADMIN_EMAIL E2E_SUPER_ADMIN_PASSWORD E2E_TARGET_SUPABASE_PROJECT_REF NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY DATABASE_URL STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY; do
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required E2E secret: ${name}"
    missing=1
  fi
done

case "${STRIPE_SECRET_KEY:-}" in
  sk_test_*) ;;
  *) echo "E2E_STRIPE_SECRET_KEY must use Stripe test mode"; missing=1 ;;
esac
case "${NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:-}" in
  pk_test_*) ;;
  *) echo "E2E_STRIPE_PUBLISHABLE_KEY must use Stripe test mode"; missing=1 ;;
esac
if [[ "${E2E_TARGET_SUPABASE_PROJECT_REF:-}" == "jegxfahsvugilbthbked" ]]; then
  echo "E2E_TARGET_SUPABASE_PROJECT_REF cannot be the production project"
  missing=1
fi

event_name="${E2E_EVENT_NAME:-}"
pr_author="${E2E_PR_AUTHOR:-}"
head_repository="${E2E_HEAD_REPOSITORY:-}"
github_repository="${GITHUB_REPOSITORY:-}"
github_ref="${GITHUB_REF:-}"

if [[ "$missing" -eq 0 ]]; then
  echo "enabled=true" >> "$GITHUB_OUTPUT"
elif [[ "$event_name" == "pull_request" && "$pr_author" == "dependabot[bot]" ]]; then
  echo "enabled=false" >> "$GITHUB_OUTPUT"
  echo "Authenticated E2E skipped for Dependabot; repository secrets are unavailable to the dependency update workflow."
elif [[ "$event_name" == "push" && "$github_ref" == "refs/heads/main" ]]; then
  echo "enabled=false" >> "$GITHUB_OUTPUT"
  echo "Authenticated E2E requires all staging-only secrets before main can pass." >&2
  exit 1
elif [[ "$event_name" == "pull_request" && "$head_repository" == "$github_repository" ]]; then
  echo "enabled=false" >> "$GITHUB_OUTPUT"
  echo "Authenticated E2E requires staging-only secrets for same-repository pull requests." >&2
  exit 1
else
  echo "enabled=false" >> "$GITHUB_OUTPUT"
  echo "Authenticated E2E skipped for an external fork without repository secrets."
fi
