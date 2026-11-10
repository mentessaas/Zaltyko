#!/usr/bin/env bash
# Postgres integration on every PR and push to main.
#
# Builds the same disposable database as scripts/ci/verify-sandbox-schema-replay.sh
# (marked current-state baseline, RLS hardening, Owner bootstrap seed and the
# synthetic two-academy isolation check) on a one-run native Postgres inside
# the GitHub runner, then runs every suite of run_disposable_postgres_suites
# plus newly discovered PostgreSQL suites. The replay script, manifest and SQL
# sources are only read and hash-checked; nothing here links, reads or writes a
# remote project, and no credential is accepted from the environment.
set -euo pipefail
umask 077

fail() {
  printf 'Postgres integration refused: %s\n' "$1" >&2
  exit 1
}

[[ "${GITHUB_ACTIONS:-}" == "true" ]] || fail "GitHub Actions is required."
# Refuse leaked credentials before anything else, including platform checks.
for forbidden in SUPABASE_ACCESS_TOKEN SUPABASE_DB_PASSWORD SUPABASE_DB_URL SUPABASE_PROJECT_REF SUPABASE_SERVICE_ROLE_KEY \
  E2E_TARGET_SUPABASE_PROJECT_REF DATABASE_URL DATABASE_URL_POOL DATABASE_URL_DIRECT \
  STRIPE_SECRET_KEY STRIPE_SAAS_TEST_SECRET_KEY STRIPE_SAAS_LIVE_SECRET_KEY VERCEL_TOKEN \
  ZALTYKO_PG_INTEGRATION_DATABASE_URL ZALTYKO_SANDBOX_READONLY_TESTS CHARGE_CONCURRENCY_TEST CHARGE_CONCURRENCY_DATABASE_URL; do
  [[ -z "${!forbidden:-}" ]] || fail "Unexpected external database, provider or sandbox configuration in the runner environment."
done

[[ "${RUNNER_OS:-}" == "Linux" && "$(uname -s)" == "Linux" ]] || fail "A disposable Linux runner is required."
[[ "$(id -u)" -ne 0 ]] || fail "The native Postgres runtime must use a non-root runner account."
[[ -n "${RUNNER_TEMP:-}" && -d "$RUNNER_TEMP" ]] || fail "RUNNER_TEMP must be an existing directory."
[[ "${GITHUB_RUN_ID:-}" =~ ^[0-9]+$ && "${GITHUB_RUN_ATTEMPT:-}" =~ ^[0-9]+$ ]] || fail "GitHub run identifiers are required."
case "${GITHUB_EVENT_NAME:-}" in
  pull_request|push) ;;
  *) fail "Only pull_request and push events may run the disposable suites." ;;
esac

readonly ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly PLANNER="$ROOT/scripts/ci/postgres_integration_plan.py"
readonly PROJECT_ID="zaltyko-pgint-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}"
readonly CI_WORKDIR="$RUNNER_TEMP/$PROJECT_ID"
readonly CLI_HOME="$RUNNER_TEMP/$PROJECT_ID-home"
readonly STATE_DIR="$RUNNER_TEMP/$PROJECT_ID-state"
readonly PINS_FILE="$STATE_DIR/pins.json"
readonly PLAN_FILE="$STATE_DIR/plan.json"
readonly START_LOG="$STATE_DIR/start.log"
readonly STATUS_LOG="$STATE_DIR/status.json"
readonly STATUS_ERROR_LOG="$STATE_DIR/status.stderr"
readonly LOCAL_DB_URL_FILE="$STATE_DIR/local-db-url"
readonly ROLE_GUARD_FILE="$STATE_DIR/role-guard.sql"
readonly AUTH_JWT_ERROR_LOG="$STATE_DIR/auth-jwt-state.stderr"
readonly REPLAY_LOG="$STATE_DIR/replay.log"
readonly REPORT_DIR="$STATE_DIR/reports"
readonly SUITE_LOG_DIR="$STATE_DIR/suite-logs"
local_stack_started=false
owned_paths=()

cleanup() {
  if [[ "$local_stack_started" == "true" && -n "${CLI:-}" ]]; then
    "$CLI" --workdir "$CI_WORKDIR" stack stop --stack "$PROJECT_ID" >/dev/null 2>&1 || true
  fi
  # Remove only paths this run created; a pre-existing path is refused below
  # and must never be deleted.
  local path
  for path in "${owned_paths[@]}"; do rm -rf -- "$path"; done
}
trap cleanup EXIT

for path in "$CI_WORKDIR" "$CLI_HOME" "$STATE_DIR"; do
  [[ ! -e "$path" && ! -L "$path" ]] || fail "Refusing to reuse an existing disposable path."
  mkdir "$path"
  owned_paths+=("$path")
done
mkdir -p "$CI_WORKDIR/supabase/migrations" "$REPORT_DIR" "$SUITE_LOG_DIR"

# Sanitize any captured CLI or vitest output before it reaches the job log.
# Usage: sanitized_excerpt LOG MAX_LINES [all|errors|summary]
sanitized_excerpt() {
  python3 - "$1" "$2" "${3:-errors}" <<'PY'
from pathlib import Path
import re
import sys

path, max_lines, mode = Path(sys.argv[1]), int(sys.argv[2]), sys.argv[3]
if not path.is_file():
    raise SystemExit(0)
text = path.read_text(encoding="utf-8", errors="replace")
text = re.sub(r"\x1b\[[0-9;]*[A-Za-z]", "", text)
text = re.sub(r"(?i)\b(?:postgres(?:ql)?|https?)://[^\s\"'`)>]+", "<redacted-connection>", text)
text = re.sub(r"\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b", "<redacted-jwt>", text)
text = re.sub(r"(?i)\b(?:sb_(?:publishable|secret)_|sk_(?:test|live)_|whsec_)[A-Za-z0-9_-]+", "<redacted-key>", text)
text = re.sub(r"(?i)\b(password|secret|token|jwt|authorization|(?:api|service[ _-]?role|anon)[ _-]?key)(\s*[:=]\s*)[^\s,;]+", r"\1\2<redacted>", text)
text = re.sub(r"\b[A-Za-z0-9_-]{48,}\b", "<redacted-long-value>", text)
lines = text.splitlines()
patterns = {
    "errors": r"error|failed|fatal|denied|cannot|could not|not found|not running|timeout|invalid|refused|sqlstate|exception|unhealthy|no space",
    "summary": r"✓|✗|×|FAIL|PASS|Test Files|Tests\s+\d|Duration",
    "failure": r"FAIL|AssertionError|Error:|expected|received|Test Files|Tests\s+\d|⎯|✓|✗|×|Unhandled|sqlstate",
}
if mode != "all":
    selected = [line for line in lines if re.search(patterns[mode], line, re.I)]
    lines = selected or lines[-24:]
for line in lines[-max_lines:]:
    print(line[:400])
PY
}

# 1. Reuse the reviewed replay inputs read-only and verify every pin before any
#    database exists. The replay script itself is pinned by the manifest.
python3 "$PLANNER" verify-pins --root "$ROOT" >"$PINS_FILE" || fail "The reviewed replay sources do not match their pins."
python3 "$PLANNER" plan --root "$ROOT" >"$PLAN_FILE" || fail "The PostgreSQL suite plan could not be built."
pin() { python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))[sys.argv[2]])' "$PINS_FILE" "$1"; }
readonly SUPABASE_CLI_VERSION="$(pin SUPABASE_CLI_VERSION)"
readonly ROLE_PROBE_NAME="$(pin ROLE_PROBE_NAME)"
readonly AUTH_JWT_MIGRATION_NAME="$(pin AUTH_JWT_MIGRATION_NAME)"
readonly MIGRATION_NAME="$(pin MIGRATION_NAME)"
readonly RLS_HARDENING_MIGRATION_NAME="$(pin RLS_HARDENING_MIGRATION_NAME)"
readonly BOOTSTRAP_SEED_MIGRATION_NAME="$(pin BOOTSTRAP_SEED_MIGRATION_NAME)"
readonly TENANT_MIGRATION_NAME="$(pin TENANT_MIGRATION_NAME)"
readonly BASELINE_SOURCE="$ROOT/$(pin BASELINE_PATH)"
readonly RLS_HARDENING_SOURCE="$ROOT/$(pin RLS_HARDENING_PATH)"
readonly BOOTSTRAP_SEED_SOURCE="$ROOT/$(pin BOOTSTRAP_SEED_PATH)"
readonly TENANT_FIXTURE_SOURCE="$ROOT/$(pin TENANT_FIXTURE_PATH)"
for value in "$SUPABASE_CLI_VERSION" "$ROLE_PROBE_NAME" "$AUTH_JWT_MIGRATION_NAME" "$MIGRATION_NAME" \
  "$RLS_HARDENING_MIGRATION_NAME" "$BOOTSTRAP_SEED_MIGRATION_NAME" "$TENANT_MIGRATION_NAME"; do
  [[ -n "$value" ]] || fail "A pinned replay constant could not be read."
done
for source_file in "$BASELINE_SOURCE" "$RLS_HARDENING_SOURCE" "$BOOTSTRAP_SEED_SOURCE" "$TENANT_FIXTURE_SOURCE"; do
  [[ -f "$source_file" ]] || fail "A pinned replay source could not be resolved."
done
readonly CLI="$RUNNER_TEMP/supabase-schema-replay-cli-$SUPABASE_CLI_VERSION/supabase"
[[ -x "$CLI" ]] || fail "The checksum-verified pinned Supabase CLI was not installed in RUNNER_TEMP."

python3 - "$PLAN_FILE" <<'PY'
import json
import sys

plan = json.load(open(sys.argv[1], encoding="utf-8"))
print(f"Planned PostgreSQL suites: {plan['suite_count']} in {len(plan['batches'])} vitest invocations.")
for index, batch in enumerate(plan["batches"], start=1):
    print(f"  batch {index} [{batch['source']}]: " + " ".join(batch["suites"]))
for item in plan["excluded_suites"]:
    print(f"  excluded: {item['path']} ({item['reason']})")
PY

export SUPABASE_HOME="$CLI_HOME"
export SUPABASE_EXPERIMENTAL_STACK=1
export SUPABASE_TELEMETRY_DISABLED=1

python3 - "$ROOT/supabase/config.toml" "$CI_WORKDIR/supabase/config.toml" "$PROJECT_ID" <<'PY'
from pathlib import Path
import re
import sys

text = Path(sys.argv[1]).read_text(encoding="utf-8")
text, replacements = re.subn(r'^project_id\s*=\s*"[^"]+"\s*$', f'project_id = "{sys.argv[3]}"', text, count=1, flags=re.MULTILINE)
if replacements != 1 or "[db.seed]" not in text or "enabled = false" not in text or "[experimental]" in text:
    raise SystemExit("The isolated Supabase config is not the expected migration-only template.")
text += "\n[experimental]\nstack = true\n"
Path(sys.argv[2]).write_text(text, encoding="utf-8")
PY

# 2. One-run native Postgres only: no Docker images, no Auth/REST/Storage
#    services, no linked project. All CLI state lives under RUNNER_TEMP.
local_stack_started=true
if ! "$CLI" --workdir "$CI_WORKDIR" stack start \
  --stack "$PROJECT_ID" \
  --runtime native \
  --preparation on-demand \
  --exclude rest,auth,realtime,storage,functions,studio,mail,analytics,pooler \
  >"$START_LOG" 2>&1; then
  printf 'Sanitized CLI startup error excerpt:\n' >&2
  sanitized_excerpt "$START_LOG" 12 errors >&2
  df -h "$RUNNER_TEMP" 2>/dev/null | tail -n 1 >&2 || true
  fail "Disposable local Postgres did not start; credential-bearing output was withheld."
fi

if ! "$CLI" --workdir "$CI_WORKDIR" stack status --stack "$PROJECT_ID" --output-format json \
  >"$STATUS_LOG" 2>"$STATUS_ERROR_LOG"; then
  fail "The disposable native stack could not be reopened by its project name; CLI output was withheld."
fi

# The status JSON carries the local password: keep it in RUNNER_TEMP, rebuild a
# minimal loopback supabase_admin URL and print only non-secret fields.
python3 - "$STATUS_LOG" "$PROJECT_ID" "$CI_WORKDIR" "$LOCAL_DB_URL_FILE" <<'PY'
from pathlib import Path
import json
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
import sys

status_path, expected_name = Path(sys.argv[1]), sys.argv[2]
expected_root, db_url_path = Path(sys.argv[3]).resolve(), Path(sys.argv[4])
try:
    payload = json.loads(status_path.read_text(encoding="utf-8"))
except (OSError, json.JSONDecodeError):
    raise SystemExit("The native stack status was not valid JSON.")

def find_report(value):
    if isinstance(value, dict):
        if isinstance(value.get("identity"), dict) and "composition" in value and "services" in value:
            return value
        children = value.values()
    elif isinstance(value, list):
        children = value
    else:
        return None
    for child in children:
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
env = report.get("env")
db_url = env.get("DB_URL", "") if isinstance(env, dict) else ""
try:
    parsed = urlsplit(db_url)
    port = parsed.port
except ValueError:
    parsed, port = None, None
if (
    parsed is None
    or parsed.scheme not in {"postgres", "postgresql"}
    or parsed.hostname not in {"127.0.0.1", "localhost", "::1"}
    or port is None
    or not 1 <= port <= 65535
    or parsed.username != "postgres"
    or not parsed.password
    or parsed.path != "/postgres"
    or parsed.fragment
):
    raise SystemExit("The stack did not provide a valid loopback Postgres URL.")
host = parsed.hostname
authority_host = f"[{host}]" if ":" in host else host
local_db_url = urlunsplit(parsed._replace(
    netloc=f"supabase_admin:{parsed.password}@{authority_host}:{port}",
    query=urlencode([("sslmode", "disable")]),
))
admin = urlsplit(local_db_url)
if (
    admin.username != "supabase_admin"
    or admin.hostname not in {"127.0.0.1", "localhost", "::1"}
    or admin.port != port
    or admin.path != "/postgres"
    or parse_qsl(admin.query) != [("sslmode", "disable")]
):
    raise SystemExit("The reconstructed local URL did not preserve its pinned target and principal.")
safe = {
    "name": identity.get("name"),
    "project_root_matches": root_matches,
    "runtime": report.get("runtime"),
    "owner": report.get("owner"),
    "readiness": report.get("readiness"),
    "database_lifecycle": None if database is None else database.get("lifecycle"),
    "database_health": None if database is None else database.get("health"),
    "database_host": host,
    "database_port": port,
    "database_user": admin.username,
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
db_url_path.write_text(local_db_url, encoding="utf-8")
db_url_path.chmod(0o600)
PY
rm -f -- "$STATUS_LOG" "$STATUS_ERROR_LOG"

LOCAL_DB_URL="$(<"$LOCAL_DB_URL_FILE")"
rm -f -- "$LOCAL_DB_URL_FILE"
EXPECTED_LOCAL_PORT="$(python3 -c 'import sys; from urllib.parse import urlsplit; print(urlsplit(sys.stdin.read()).port)' <<<"$LOCAL_DB_URL")"
[[ "$EXPECTED_LOCAL_PORT" =~ ^[0-9]+$ ]] || fail "The reconstructed local URL lost its pinned port."

if ! ROLE_STATE_CSV="$("$CLI" --workdir "$CI_WORKDIR" --output csv db query \
  --db-url "$LOCAL_DB_URL" \
  "SELECT session_user AS login_role, (SELECT rolsuper FROM pg_roles WHERE rolname = session_user) AS login_is_superuser, COALESCE(inet_server_addr()::text, '') AS server_address, COALESCE(inet_server_port()::text, '') AS server_port;" 2>/dev/null)"; then
  fail "Could not inspect the disposable replay principal; CLI output was withheld."
fi
IFS=, read -r login_role login_is_superuser server_address server_port <<<"$(printf '%s\n' "$ROLE_STATE_CSV" | tail -n 1 | tr -d '\r')"
unset ROLE_STATE_CSV
[[ "$login_role" == "supabase_admin" && "$login_is_superuser" == "true" ]] || fail "The disposable login was not the verified Supabase superuser."
if [[ -z "$server_address" && -z "$server_port" ]]; then
  printf 'Verified native database transport: Unix socket on the pinned loopback stack.\n'
elif [[ "$server_address" == "127.0.0.1" && "$server_port" == "$EXPECTED_LOCAL_PORT" ]]; then
  printf 'Verified native database transport: loopback TCP on port %s.\n' "$EXPECTED_LOCAL_PORT"
else
  fail "The local query did not resolve to the pinned native database transport."
fi

# Same session-local role guard as the reviewed replay: SET ROLE NONE runs
# dynamically inside one DO block so the pinned CLI does not reassert postgres.
cat >"$ROLE_GUARD_FILE" <<'SQL'
DO $ci_supabase_admin_role_guard$
DECLARE
  v_is_superuser boolean;
BEGIN
  EXECUTE 'SET ROLE NONE';
  IF session_user <> 'supabase_admin' OR current_user <> 'supabase_admin' THEN
    RAISE EXCEPTION 'Disposable replay did not restore the supabase_admin session role';
  END IF;
  SELECT rolsuper INTO v_is_superuser FROM pg_roles WHERE rolname = current_user;
  IF v_is_superuser IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Disposable replay role is not a superuser';
  END IF;
END
$ci_supabase_admin_role_guard$;
SQL

# apply_migration NAME DESCRIPTION SOURCE... : prepend the role guard, place the
# file in the disposable workdir only, and apply it to the local database.
apply_migration() {
  local name="$1" description="$2"
  shift 2
  local target="$CI_WORKDIR/supabase/migrations/$name"
  cat -- "$ROLE_GUARD_FILE" "$@" >"$target"
  chmod 600 "$target"
  if ! "$CLI" --workdir "$CI_WORKDIR" migration up --db-url "$LOCAL_DB_URL" >"$REPLAY_LOG" 2>&1; then
    printf 'Sanitized migration error excerpt (%s):\n' "$description" >&2
    sanitized_excerpt "$REPLAY_LOG" 16 errors >&2
    fail "$description did not apply on disposable local Postgres."
  fi
  printf 'Applied on disposable Postgres: %s\n' "$description"
}

empty_sql="$STATE_DIR/empty.sql"
: >"$empty_sql"
apply_migration "$ROLE_PROBE_NAME" "Supabase replay role probe" "$empty_sql"

if ! AUTH_JWT_STATE_CSV="$("$CLI" --workdir "$CI_WORKDIR" --output csv db query \
  --db-url "$LOCAL_DB_URL" \
  "SELECT COALESCE(pg_get_function_result(to_regprocedure('auth.jwt()')) = 'jsonb', false) AS auth_jwt_returns_jsonb;" \
  2>"$AUTH_JWT_ERROR_LOG")"; then
  fail "Could not inspect the disposable database's standard Supabase Auth JWT helper."
fi
auth_jwt_state="$(printf '%s\n' "$AUTH_JWT_STATE_CSV" | tail -n 1 | tr -d '\r')"
unset AUTH_JWT_STATE_CSV
case "$auth_jwt_state" in
  true|t) printf 'Verified disposable platform prerequisite: auth.jwt() returns jsonb.\n' ;;
  false|f)
    auth_jwt_sql="$STATE_DIR/auth-jwt.sql"
    cat >"$auth_jwt_sql" <<'SQL'
CREATE OR REPLACE FUNCTION auth.jwt()
RETURNS jsonb
LANGUAGE sql STABLE
AS $ci_supabase_auth_jwt$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim', true), ''),
    NULLIF(current_setting('request.jwt.claims', true), '')
  )::jsonb
$ci_supabase_auth_jwt$;
SQL
    apply_migration "$AUTH_JWT_MIGRATION_NAME" "Upstream-compatible auth.jwt() helper (disposable only)" "$auth_jwt_sql"
    ;;
  *) fail "The disposable Auth JWT helper probe returned an unexpected result." ;;
esac

# 3. Same sources, same order as the reviewed replay: marked baseline, RLS
#    hardening, Owner bootstrap seed, synthetic two-academy isolation.
python3 -c 'import sys; sys.exit(0 if open(sys.argv[1], "rb").read(64).startswith(b"-- CURRENT-STATE SCHEMA SNAPSHOT;") else 1)' \
  "$BASELINE_SOURCE" || fail "The replay input is not the reviewed current-state baseline."
marker_sql="$STATE_DIR/replay-marker.sql"
printf "SET app.schema_snapshot_replay = 'ci-empty-replay';\n" >"$marker_sql"
apply_migration "$MIGRATION_NAME" "Marker-guarded current-state baseline" "$marker_sql" "$BASELINE_SOURCE"
apply_migration "$RLS_HARDENING_MIGRATION_NAME" "RLS hardening migration" "$RLS_HARDENING_SOURCE"
apply_migration "$BOOTSTRAP_SEED_MIGRATION_NAME" "Owner bootstrap reference seed" "$BOOTSTRAP_SEED_SOURCE"
apply_migration "$TENANT_MIGRATION_NAME" "Synthetic two-academy RLS isolation check" "$TENANT_FIXTURE_SOURCE"
rm -f -- "$REPLAY_LOG"

# 4. Run every planned suite. A failing batch does not stop later batches so
#    one run reports every failure; the job still fails at the end.
mapfile -t batch_lines < <(python3 -c '
import json, sys
for batch in json.load(open(sys.argv[1], encoding="utf-8"))["batches"]:
    print(batch["source"] + "\t" + " ".join(batch["suites"]))
' "$PLAN_FILE")
[[ "${#batch_lines[@]}" -gt 0 ]] || fail "The PostgreSQL suite plan is empty."

failed_batches=0
batch_index=0
for line in "${batch_lines[@]}"; do
  batch_index=$((batch_index + 1))
  source_kind="${line%%$'\t'*}"
  read -r -a suites <<<"${line#*$'\t'}"
  label="$(printf 'batch-%02d' "$batch_index")"
  printf '::group::PostgreSQL %s [%s]: %s\n' "$label" "$source_kind" "${suites[*]}"
  if ZALTYKO_PG_INTEGRATION=1 ZALTYKO_PG_INTEGRATION_DATABASE_URL="$LOCAL_DB_URL" NODE_ENV=test CI_ISOLATED=1 \
    pnpm exec vitest run --project web \
      --reporter=default --reporter=json --outputFile.json="$REPORT_DIR/$label.json" \
      "${suites[@]}" >"$SUITE_LOG_DIR/$label.log" 2>&1; then
    sanitized_excerpt "$SUITE_LOG_DIR/$label.log" 60 summary
  else
    failed_batches=$((failed_batches + 1))
    printf 'Sanitized PostgreSQL integration failure follows; connection strings and long credentials are redacted.\n'
    sanitized_excerpt "$SUITE_LOG_DIR/$label.log" 80 failure
    printf '::error::PostgreSQL %s failed: %s\n' "$label" "${suites[*]}"
  fi
  printf '::endgroup::\n'
done
unset LOCAL_DB_URL EXPECTED_LOCAL_PORT

# 5. Prove the suites really ran: every planned file must report at least one
#    passed test, none failed and none skipped. Only names and counts are printed.
if ! python3 - "$PLAN_FILE" "$REPORT_DIR" "$ROOT" "${GITHUB_STEP_SUMMARY:-}" <<'PY'
from pathlib import Path
import json
import sys

plan = json.load(open(sys.argv[1], encoding="utf-8"))
report_dir, root = Path(sys.argv[2]), Path(sys.argv[3]).resolve()
summary_path = sys.argv[4]
planned = [suite for batch in plan["batches"] for suite in batch["suites"]]
results = {}
for report in sorted(report_dir.glob("batch-*.json")):
    try:
        payload = json.loads(report.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        continue
    for item in payload.get("testResults", []):
        try:
            name = Path(item["name"]).resolve().relative_to(root).as_posix()
        except (KeyError, ValueError):
            name = str(item.get("name", "?"))
        counts = results.setdefault(name, {"passed": 0, "failed": 0, "skipped": 0, "file_failed": False})
        if item.get("status") == "failed":
            counts["file_failed"] = True
        for assertion in item.get("assertionResults", []):
            status = assertion.get("status")
            key = status if status in {"passed", "failed"} else "skipped"
            counts[key] += 1

problems = []
rows = []
for suite in planned:
    counts = results.get(suite)
    if counts is None:
        problems.append(f"{suite}: no vitest result (not executed or crashed before reporting)")
        rows.append((suite, "-", "-", "-", "NOT RUN"))
        continue
    state = "ok"
    if counts["failed"] or counts["file_failed"]:
        state = "FAILED"
        problems.append(f"{suite}: {counts['failed']} failed test(s)")
    elif counts["passed"] == 0:
        state = "NO TESTS RAN"
        problems.append(f"{suite}: no passed tests")
    elif counts["skipped"]:
        state = "SKIPPED TESTS"
        problems.append(f"{suite}: {counts['skipped']} skipped/todo test(s) with ZALTYKO_PG_INTEGRATION=1")
    rows.append((suite, counts["passed"], counts["failed"], counts["skipped"], state))
unexpected = sorted(set(results) - set(planned))
for suite in unexpected:
    problems.append(f"{suite}: reported but not planned")

total_passed = sum(r[1] for r in rows if isinstance(r[1], int))
total_failed = sum(r[2] for r in rows if isinstance(r[2], int))
discovered = set(plan["discovered_suites"])
lines = [
    "## Postgres integration",
    "",
    f"Disposable local Supabase Postgres (native, loopback). Suites: **{len(planned)}** "
    f"({len(planned) - len(discovered)} from run_disposable_postgres_suites, {len(discovered)} discovered). "
    f"Tests passed: **{total_passed}**, failed: **{total_failed}**.",
    "",
    "| Suite | Origin | Passed | Failed | Skipped | State |",
    "| --- | --- | ---: | ---: | ---: | --- |",
]
for suite, passed, failed, skipped, state in rows:
    origin = "discovered" if suite in discovered else "replay"
    lines.append(f"| `{suite}` | {origin} | {passed} | {failed} | {skipped} | {state} |")
lines += ["", "Excluded (remote sandbox only):"]
lines += [f"- `{item['path']}`: {item['reason']}" for item in plan["excluded_suites"]]
text = "\n".join(lines) + "\n"
print(text)
if summary_path:
    with open(summary_path, "a", encoding="utf-8") as handle:
        handle.write(text)
if problems:
    print("PostgreSQL integration problems:", file=sys.stderr)
    for problem in problems:
        print(f"  - {problem}", file=sys.stderr)
    raise SystemExit(1)
print(f"PASS: {len(planned)} PostgreSQL suites, {total_passed} tests on disposable local Postgres.")
PY
then
  fail "At least one PostgreSQL suite failed, was skipped or did not report."
fi
[[ "$failed_batches" -eq 0 ]] || fail "$failed_batches PostgreSQL suite batch(es) failed."
