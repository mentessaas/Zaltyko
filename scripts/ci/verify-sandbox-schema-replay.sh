#!/usr/bin/env bash
set -euo pipefail

readonly EXPECTED_BRANCH="codex/owner-isolated-validation-20261023"
readonly MIGRATION_NAME="20261024172153_sandbox_schema_snapshot_baseline.sql"
readonly ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

fail() {
  printf 'Schema replay refused: %s\n' "$1" >&2
  exit 1
}

[[ "${GITHUB_ACTIONS:-}" == "true" ]] || fail "GitHub Actions is required."
[[ "${RUNNER_OS:-}" == "Linux" && "$(uname -s)" == "Linux" ]] || fail "A disposable Linux runner is required."
[[ -n "${RUNNER_TEMP:-}" && -d "$RUNNER_TEMP" ]] || fail "RUNNER_TEMP must be an existing directory."
[[ "${GITHUB_REF:-}" == "refs/heads/$EXPECTED_BRANCH" ]] || fail "Unexpected workflow branch."
[[ "${DISPATCH_REF:-}" == "refs/heads/$EXPECTED_BRANCH" ]] || fail "Unexpected dispatched ref."
[[ "${EXPECTED_SHA:-}" =~ ^[0-9a-f]{40}$ ]] || fail "A full expected commit SHA is required."
[[ "${DISPATCH_SHA:-}" == "$(git -C "$ROOT" rev-parse HEAD)" ]] || fail "The checked out SHA differs from the dispatch SHA."
[[ "${EXPECTED_SHA}" == "$(git -C "$ROOT" rev-parse HEAD)" ]] || fail "The checked out SHA differs from the approved SHA."

for forbidden in SUPABASE_ACCESS_TOKEN SUPABASE_DB_PASSWORD SUPABASE_DB_URL SUPABASE_PROJECT_REF E2E_TARGET_SUPABASE_PROJECT_REF DATABASE_URL DATABASE_URL_POOL DATABASE_URL_DIRECT; do
  [[ -z "${!forbidden:-}" ]] || fail "Unexpected external database credential/configuration in runner environment."
done

readonly PROJECT_ID="zaltyko-schema-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}"
readonly CI_WORKDIR="$RUNNER_TEMP/$PROJECT_ID"
readonly CLI="$RUNNER_TEMP/supabase-cli-2.84.2/supabase"
readonly START_LOG="$RUNNER_TEMP/$PROJECT_ID-start.log"
readonly RESET_LOG="$RUNNER_TEMP/$PROJECT_ID-reset.log"
readonly TENANT_LOG="$RUNNER_TEMP/$PROJECT_ID-tenant.log"
readonly GUARD_LOG="$RUNNER_TEMP/$PROJECT_ID-guard.log"
readonly MARKER_GUARD_LOG="$RUNNER_TEMP/$PROJECT_ID-marker-guard.log"
local_stack_started=false

cleanup() {
  if [[ "$local_stack_started" == "true" ]]; then
    "$CLI" --workdir "$CI_WORKDIR" stop --project-id "$PROJECT_ID" --no-backup >/dev/null 2>&1 || true
  fi
  rm -rf -- "$CI_WORKDIR" "$START_LOG" "$RESET_LOG" "$TENANT_LOG" "$GUARD_LOG" "$MARKER_GUARD_LOG"
}
trap cleanup EXIT

[[ -x "$CLI" ]] || fail "The checksum-verified pinned Supabase CLI was not installed in RUNNER_TEMP."
[[ ! -e "$CI_WORKDIR" ]] || fail "Refusing to reuse an existing local Supabase workdir."
mkdir -p "$CI_WORKDIR/supabase/migrations"

python3 - "$ROOT/supabase/config.toml" "$CI_WORKDIR/supabase/config.toml" "$PROJECT_ID" <<'PY'
from pathlib import Path
import re
import sys

source = Path(sys.argv[1])
destination = Path(sys.argv[2])
project_id = sys.argv[3]
text = source.read_text(encoding="utf-8")
text, replacements = re.subn(r'^project_id\s*=\s*"[^"]+"\s*$', f'project_id = "{project_id}"', text, count=1, flags=re.MULTILINE)
if replacements != 1 or "[db.seed]" not in text or "enabled = false" not in text:
    raise SystemExit("The isolated Supabase config is not the expected migration-only template.")
Path(destination).write_text(text, encoding="utf-8")
PY

mapfile -t migrations < <(find "$ROOT/supabase/migrations" -maxdepth 1 -type f -name '*.sql' -printf '%f\n' | sort)
[[ "${#migrations[@]}" -eq 1 && "${migrations[0]}" == "$MIGRATION_NAME" ]] || fail "Expected exactly the reviewed current-state baseline migration."
cp "$ROOT/supabase/migrations/$MIGRATION_NAME" "$CI_WORKDIR/supabase/migrations/$MIGRATION_NAME"

# Start only disposable local Postgres. Supabase CLI startup output includes
# generated local credentials, so it is kept in RUNNER_TEMP and never printed.
local_stack_started=true
if ! "$CLI" --workdir "$CI_WORKDIR" start \
  --exclude gotrue,realtime,storage-api,imgproxy,kong,postgrest,postgres-meta,studio,edge-runtime,logflare,vector,supavisor \
  >"$START_LOG" 2>&1; then
  fail "Disposable local Postgres did not start; CLI output was withheld to avoid credential disclosure."
fi

# The schema snapshot refuses to run without this database-local marker. It is
# set only on the disposable runner database, never on the linked sandbox.
if ! "$CLI" --workdir "$CI_WORKDIR" db query --local \
  "ALTER DATABASE postgres SET app.schema_snapshot_replay = 'ci-empty-replay';" \
  >"$RESET_LOG" 2>&1; then
  fail "Could not configure the one-run marker on disposable local Postgres."
fi

if ! "$CLI" --workdir "$CI_WORKDIR" db reset --local --no-seed >"$RESET_LOG" 2>&1; then
  fail "The baseline did not replay on an empty disposable local database; CLI output was withheld."
fi

if ! "$CLI" --workdir "$CI_WORKDIR" db query --local --file "$ROOT/scripts/ci/sandbox-tenant-isolation.sql" >"$TENANT_LOG" 2>&1; then
  fail "The synthetic two-academy RLS isolation check failed; CLI output was withheld."
fi

if "$CLI" --workdir "$CI_WORKDIR" db query --local --file "$CI_WORKDIR/supabase/migrations/$MIGRATION_NAME" >"$GUARD_LOG" 2>&1; then
  fail "The current-state baseline unexpectedly allowed replay over an existing schema."
fi
if ! grep -Fq 'Refusing current-state schema baseline' "$GUARD_LOG"; then
  fail "Baseline reapplication failed for a reason other than its empty-schema guard."
fi

if ! "$CLI" --workdir "$CI_WORKDIR" db query --local \
  "ALTER DATABASE postgres RESET app.schema_snapshot_replay;" \
  >"$MARKER_GUARD_LOG" 2>&1; then
  fail "Could not remove the one-run marker from disposable local Postgres."
fi
if "$CLI" --workdir "$CI_WORKDIR" db query --local --file "$CI_WORKDIR/supabase/migrations/$MIGRATION_NAME" >"$MARKER_GUARD_LOG" 2>&1; then
  fail "The current-state baseline unexpectedly ran without its isolated CI marker."
fi
if ! grep -Fq 'isolated CI replay marker is missing' "$MARKER_GUARD_LOG"; then
  fail "Baseline reapplication without the marker failed for an unexpected reason."
fi

printf 'PASS: current-state snapshot replayed on an empty disposable Postgres database.\n'
printf 'PASS: synthetic two-academy RLS reads, writes, and rollback were verified.\n'
printf 'PASS: baseline guards refused populated and unmarked databases before DDL.\n'
