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

diagnose_start_failure() {
  local diagnosis="Supabase CLI startup failed; credential-bearing output remains withheld."
  if ! docker info --format '{{.ServerVersion}}' >/dev/null 2>&1; then
    diagnosis="Docker daemon is unavailable to this runner."
  elif grep -Eiq 'no space left on device' "$START_LOG"; then
    diagnosis="The disposable runner ran out of disk space while starting Supabase."
  elif grep -Eiq 'port is already allocated|address already in use' "$START_LOG"; then
    diagnosis="A required local Supabase port is already in use on the disposable runner."
  elif grep -Eiq 'pull access denied|manifest unknown|repository does not exist' "$START_LOG"; then
    diagnosis="A required Supabase container image could not be fetched."
  elif grep -Eiq 'unhealthy|failed to start|container exited' "$START_LOG"; then
    diagnosis="A Supabase container failed its startup or health check."
  fi
  printf 'Safe startup diagnosis: %s\n' "$diagnosis" >&2

  local container_state
  container_state="$(docker ps -a --filter "name=$PROJECT_ID" --format '{{.Names}} | {{.Status}}' 2>/dev/null || true)"
  if [[ -n "$container_state" ]]; then
    printf 'Disposable container states (names and status only):\n%s\n' \
      "${container_state//$PROJECT_ID/<isolated-run>}" >&2
  else
    printf 'No containers for the disposable Supabase project remained visible.\n' >&2
  fi
}

diagnose_marker_failure() {
  local diagnosis="The disposable database marker statement failed; query output remains withheld."
  if grep -Eiq 'permission denied' "$RESET_LOG"; then
    diagnosis="The local database connection lacks permission to set the one-run marker."
  elif grep -Eiq 'unrecognized configuration parameter|invalid configuration parameter' "$RESET_LOG"; then
    diagnosis="PostgreSQL rejected the custom one-run marker setting."
  elif grep -Eiq 'cannot run inside a transaction block' "$RESET_LOG"; then
    diagnosis="The CLI query protocol cannot run ALTER DATABASE in its current transaction context."
  elif grep -Eiq 'connection refused|context deadline exceeded|i/o timeout|no route to host' "$RESET_LOG"; then
    diagnosis="The local Postgres connection was unavailable while setting the one-run marker."
  elif grep -Eiq 'syntax error|invalid value|does not exist' "$RESET_LOG"; then
    diagnosis="PostgreSQL rejected the marker SQL or its target database."
  fi
  printf 'Safe marker diagnosis: %s\n' "$diagnosis" >&2
}

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

# Start only disposable local Postgres rather than the full Supabase service
# stack. CLI output is kept in RUNNER_TEMP and never printed because it may
# include generated local credentials.
local_stack_started=true
if ! "$CLI" --workdir "$CI_WORKDIR" db start >"$START_LOG" 2>&1; then
  diagnose_start_failure
  fail "Disposable local Postgres did not start; CLI output was withheld to avoid credential disclosure."
fi

# Keep the marker-guarded current-state migration out of CLI startup. Some CLI
# startup paths apply discovered migrations before a database-local marker can
# be set; copy the reviewed baseline only after the empty local DB is running.
cp "$ROOT/supabase/migrations/$MIGRATION_NAME" "$CI_WORKDIR/supabase/migrations/$MIGRATION_NAME"

# The schema snapshot refuses to run without this database-local marker. It is
# set only on the disposable runner database, never on the linked sandbox.
if ! "$CLI" --workdir "$CI_WORKDIR" db query --local \
  "ALTER DATABASE postgres SET app.schema_snapshot_replay = 'ci-empty-replay';" \
  >"$RESET_LOG" 2>&1; then
  diagnose_marker_failure
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
