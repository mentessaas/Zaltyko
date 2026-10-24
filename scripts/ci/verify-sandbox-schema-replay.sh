#!/usr/bin/env bash
set -euo pipefail
umask 077

readonly EXPECTED_BRANCH="codex/owner-isolated-validation-20261023"
readonly MIGRATION_NAME="20261024172153_sandbox_schema_snapshot_baseline.sql"
readonly SUPABASE_CLI_VERSION="2.119.0"
readonly ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

fail() {
  printf 'Schema replay refused: %s\n' "$1" >&2
  exit 1
}

[[ "${GITHUB_ACTIONS:-}" == "true" ]] || fail "GitHub Actions is required."
[[ "${RUNNER_OS:-}" == "Linux" && "$(uname -s)" == "Linux" ]] || fail "A disposable Linux runner is required."
[[ "$(id -u)" -ne 0 ]] || fail "The native Postgres runtime must use a non-root runner account."
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
readonly CLI_HOME="$RUNNER_TEMP/$PROJECT_ID-home"
readonly CLI="$RUNNER_TEMP/supabase-schema-replay-cli-$SUPABASE_CLI_VERSION/supabase"
readonly START_LOG="$RUNNER_TEMP/$PROJECT_ID-start.log"
readonly STATUS_LOG="$RUNNER_TEMP/$PROJECT_ID-status.json"
readonly RESET_LOG="$RUNNER_TEMP/$PROJECT_ID-reset.log"
readonly TENANT_LOG="$RUNNER_TEMP/$PROJECT_ID-tenant.log"
readonly GUARD_LOG="$RUNNER_TEMP/$PROJECT_ID-guard.log"
readonly MARKER_GUARD_LOG="$RUNNER_TEMP/$PROJECT_ID-marker-guard.log"
local_stack_started=false

cleanup() {
  if [[ "$local_stack_started" == "true" ]]; then
    "$CLI" --workdir "$CI_WORKDIR" stack stop --stack "$PROJECT_ID" >/dev/null 2>&1 || true
  fi
  rm -rf -- "$CI_WORKDIR" "$CLI_HOME" \
    "$RUNNER_TEMP/supabase-schema-replay-cli-$SUPABASE_CLI_VERSION" \
    "$RUNNER_TEMP/supabase_${SUPABASE_CLI_VERSION}_linux_amd64.tar.gz" \
    "$START_LOG" "$STATUS_LOG" "$RESET_LOG" "$TENANT_LOG" "$GUARD_LOG" "$MARKER_GUARD_LOG"
}
trap cleanup EXIT

export SUPABASE_HOME="$CLI_HOME"
export SUPABASE_EXPERIMENTAL_STACK=1
export SUPABASE_TELEMETRY_DISABLED=1

diagnose_start_failure() {
  local diagnosis="Native Supabase Postgres startup failed; credential-bearing output remains withheld."
  if grep -Eiq 'no space left on device' "$START_LOG"; then
    diagnosis="The disposable runner ran out of disk space while starting Supabase."
  elif grep -Eiq 'port is already allocated|address already in use' "$START_LOG"; then
    diagnosis="A required local Supabase port is already in use on the disposable runner."
  elif grep -Eiq 'download|failed to extract|checksum|archive' "$START_LOG"; then
    diagnosis="A verified native Supabase service archive could not be downloaded or prepared."
  elif grep -Eiq 'permission denied|not a tty|must not run as root|cannot run as root' "$START_LOG"; then
    diagnosis="The runner user does not meet the native Postgres startup requirements."
  fi
  printf 'Safe startup diagnosis: %s\n' "$diagnosis" >&2
  df -h "$RUNNER_TEMP" 2>/dev/null | tail -n 1 >&2 || true

  python3 - "$START_LOG" <<'PY' >&2
from pathlib import Path
import re
import sys

path = Path(sys.argv[1])
if not path.is_file():
    raise SystemExit(0)
matches = [
    line for line in path.read_text(encoding="utf-8", errors="replace").splitlines()
    if re.search(r"error|failed|fatal|denied|cannot|not found|timeout|unhealthy|invalid|refused|no space", line, re.I)
]
print("Sanitized CLI startup error excerpt:")
for line in matches[-12:]:
    line = re.sub(r"\x1b\[[0-9;]*[A-Za-z]", "", line)
    line = re.sub(r"(?i)\b(postgres(?:ql)?://)\S+", r"\1<redacted>", line)
    line = re.sub(r"\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b", "<redacted-jwt>", line)
    line = re.sub(r"(?i)\b(?:sb_(?:publishable|secret)_|sk_(?:test|live)_|whsec_)[A-Za-z0-9_-]+", "<redacted-key>", line)
    line = re.sub(r"(?i)\b(password|secret|token|jwt|authorization|(?:api|service[ _-]?role|anon)[ _-]?key)(\s*[:=]\s*)[^\s,;]+", r"\1\2<redacted>", line)
    line = re.sub(r"\b[A-Za-z0-9_-]{64,}\b", "<redacted-long-value>", line)
    print(line[:400])
PY
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
  elif grep -Eiq 'unknown flag|flag provided but not defined|unknown command|unknown shorthand|no such command' "$RESET_LOG"; then
    diagnosis="The pinned Supabase CLI does not accept the local marker-query command or flag."
  elif grep -Eiq 'could not find|not found|not running|connection reset|database system is starting|failed to connect|error connecting' "$RESET_LOG"; then
    diagnosis="The pinned Supabase CLI could not resolve or connect to its disposable local Postgres endpoint."
  fi
  printf 'Safe marker diagnosis: %s\n' "$diagnosis" >&2

  python3 - "$RESET_LOG" <<'PY' >&2
from pathlib import Path
import re
import sys

path = Path(sys.argv[1])
if not path.is_file():
    raise SystemExit(0)
matches = [
    line for line in path.read_text(encoding="utf-8", errors="replace").splitlines()
    if re.search(r"error|failed|fatal|denied|cannot|could not|not found|not running|timeout|invalid|refused|unknown flag|unknown command|sqlstate|connection|database", line, re.I)
]
print("Sanitized marker-query error excerpt:")
for line in matches[-16:]:
    line = re.sub(r"\x1b\[[0-9;]*[A-Za-z]", "", line)
    line = re.sub(r"(?i)\b(?:postgres(?:ql)?|https?)://\S+", "<redacted-connection>", line)
    line = re.sub(r"\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b", "<redacted-jwt>", line)
    line = re.sub(r"(?i)\b(?:sb_(?:publishable|secret)_|sk_(?:test|live)_|whsec_)[A-Za-z0-9_-]+", "<redacted-key>", line)
    line = re.sub(r"(?i)\b(password|secret|token|jwt|authorization|(?:api|service[ _-]?role|anon)[ _-]?key)(\s*[:=]\s*)[^\s,;]+", r"\1\2<redacted>", line)
    line = re.sub(r"\b[A-Za-z0-9_-]{64,}\b", "<redacted-long-value>", line)
    print(line[:400])
PY
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
if replacements != 1 or "[db.seed]" not in text or "enabled = false" not in text or "[experimental]" in text:
    raise SystemExit("The isolated Supabase config is not the expected migration-only template.")
text += "\n[experimental]\nstack = true\n"
Path(destination).write_text(text, encoding="utf-8")
PY

mapfile -t migrations < <(find "$ROOT/supabase/migrations" -maxdepth 1 -type f -name '*.sql' -printf '%f\n' | sort)
[[ "${#migrations[@]}" -eq 1 && "${migrations[0]}" == "$MIGRATION_NAME" ]] || fail "Expected exactly the reviewed current-state baseline migration."

# Start only disposable native Postgres rather than Docker images or the full
# Supabase service stack. The stack is one-run, native mode is explicitly
# selected, and all CLI state stays under RUNNER_TEMP.
local_stack_started=true
if ! "$CLI" --workdir "$CI_WORKDIR" stack start \
  --stack "$PROJECT_ID" \
  --runtime native \
  --preparation on-demand \
  --exclude rest,auth,realtime,storage,functions,studio,mail,analytics,pooler \
  >"$START_LOG" 2>&1; then
  diagnose_start_failure
  fail "Disposable local Postgres did not start; CLI output was withheld to avoid credential disclosure."
fi

# `db query --local` discovers the experimental stack through its saved project
# identity. Inspect that exact identity and the database readiness before any
# SQL is sent; the CLI status JSON contains credentials, so keep it in RUNNER_TEMP
# and print only an explicit allowlist of non-secret fields.
if ! "$CLI" --workdir "$CI_WORKDIR" stack status \
  --stack "$PROJECT_ID" \
  --output-format json \
  >"$STATUS_LOG" 2>&1; then
  fail "The disposable native stack could not be reopened by its project name; CLI output was withheld."
fi

python3 - "$STATUS_LOG" "$PROJECT_ID" "$CI_WORKDIR" <<'PY'
from pathlib import Path
import json
import sys

status_path = Path(sys.argv[1])
expected_name = sys.argv[2]
expected_root = Path(sys.argv[3]).resolve()

try:
    payload = json.loads(status_path.read_text(encoding="utf-8"))
except (OSError, json.JSONDecodeError):
    raise SystemExit("The native stack status was not valid JSON.")

def find_report(value):
    if isinstance(value, dict):
        if isinstance(value.get("identity"), dict) and "composition" in value and "services" in value:
            return value
        for child in value.values():
            found = find_report(child)
            if found is not None:
                return found
    elif isinstance(value, list):
        for child in value:
            found = find_report(child)
            if found is not None:
                return found
    return None

report = find_report(payload)
if report is None:
    raise SystemExit("The native stack status had no recognized stack report.")

identity = report["identity"]
members = report["composition"].get("members", [])
database = next((member for member in members if member.get("service") == "database"), None)
root_matches = Path(identity.get("project_root", "")).resolve() == expected_root
safe = {
    "name": identity.get("name"),
    "project_root_matches": root_matches,
    "runtime": report.get("runtime"),
    "owner": report.get("owner"),
    "readiness": report.get("readiness"),
    "database_lifecycle": None if database is None else database.get("lifecycle"),
    "database_health": None if database is None else database.get("health"),
}
print("Sanitized native stack status: " + json.dumps(safe, sort_keys=True))

if (
    identity.get("name") != expected_name
    or not root_matches
    or report.get("runtime") != "native"
    or report.get("owner") != "reachable"
    or report.get("readiness") != "ready"
    or database is None
    or database.get("lifecycle") != "running"
    or database.get("health") != "healthy"
):
    raise SystemExit("The isolated native Postgres stack identity or health check failed.")
PY

# Keep the marker-guarded current-state migration out of CLI startup. Some CLI
# startup paths apply discovered migrations before a database-local marker can
# be set; copy the reviewed baseline only after the empty local DB is running.
cp "$ROOT/supabase/migrations/$MIGRATION_NAME" "$CI_WORKDIR/supabase/migrations/$MIGRATION_NAME"

# The schema snapshot refuses to run without this database-local marker. It is
# set only on the disposable runner database, never on the linked sandbox.
if ! "$CLI" --debug --workdir "$CI_WORKDIR" db query --local \
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
