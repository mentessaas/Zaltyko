#!/usr/bin/env bash
set -euo pipefail
umask 077

readonly EXPECTED_BRANCH="codex/owner-isolated-validation-20261023"
readonly ROLE_PROBE_NAME="20261024172151_sandbox_replay_principal_probe.sql"
readonly AUTH_JWT_MIGRATION_NAME="20261024172152_supabase_auth_jwt_platform_prerequisite.sql"
readonly MIGRATION_NAME="20261024172153_sandbox_schema_snapshot_baseline.sql"
readonly TENANT_MIGRATION_NAME="20261024172154_sandbox_tenant_isolation.sql"
readonly GUARD_PROBE_NAME="20261024172155_sandbox_schema_guard_probe.sql"
readonly UNMARKED_PROBE_NAME="20261024172156_sandbox_schema_unmarked_guard_probe.sql"
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
readonly STATUS_ERROR_LOG="$RUNNER_TEMP/$PROJECT_ID-status.stderr"
readonly LOCAL_DB_URL_FILE="$RUNNER_TEMP/$PROJECT_ID-local-db-url"
readonly ROLE_GUARD_FILE="$RUNNER_TEMP/$PROJECT_ID-role-guard.sql"
readonly AUTH_JWT_ERROR_LOG="$RUNNER_TEMP/$PROJECT_ID-auth-jwt-state.stderr"
readonly AUTH_JWT_MIGRATION_FILE="$RUNNER_TEMP/$PROJECT_ID-auth-jwt-migration.sql"
readonly MARKED_BASELINE_FILE="$RUNNER_TEMP/$PROJECT_ID-marked-baseline.sql"
readonly REPLAY_LOG="$RUNNER_TEMP/$PROJECT_ID-replay.log"
readonly TENANT_LOG="$RUNNER_TEMP/$PROJECT_ID-tenant.log"
readonly GUARD_LOG="$RUNNER_TEMP/$PROJECT_ID-guard.log"
readonly UNMARKED_GUARD_LOG="$RUNNER_TEMP/$PROJECT_ID-unmarked-guard.log"
local_stack_started=false

cleanup() {
  if [[ "$local_stack_started" == "true" ]]; then
    "$CLI" --workdir "$CI_WORKDIR" stack stop --stack "$PROJECT_ID" >/dev/null 2>&1 || true
  fi
  rm -rf -- "$CI_WORKDIR" "$CLI_HOME" \
    "$RUNNER_TEMP/supabase-schema-replay-cli-$SUPABASE_CLI_VERSION" \
    "$RUNNER_TEMP/supabase_${SUPABASE_CLI_VERSION}_linux_amd64.tar.gz" \
    "$START_LOG" "$STATUS_LOG" "$STATUS_ERROR_LOG" "$LOCAL_DB_URL_FILE" "$ROLE_GUARD_FILE" \
    "$AUTH_JWT_ERROR_LOG" "$AUTH_JWT_MIGRATION_FILE" \
    "$MARKED_BASELINE_FILE" "$REPLAY_LOG" "$TENANT_LOG" "$GUARD_LOG" "$UNMARKED_GUARD_LOG"
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
  local diagnosis="The disposable migration runner rejected the session-local marker or schema replay; CLI output remains withheld."
  if grep -Eiq 'permission denied to change default privileges' "$REPLAY_LOG"; then
    diagnosis="The disposable Postgres replay principal cannot restore the snapshot's role-scoped default ACLs."
  elif grep -Eiq 'permission denied' "$REPLAY_LOG"; then
    diagnosis="The local database role could not set the session-local replay marker."
  elif grep -Eiq 'unrecognized configuration parameter|invalid configuration parameter' "$REPLAY_LOG"; then
    diagnosis="PostgreSQL rejected the custom one-run marker setting."
  elif grep -Eiq 'cannot run inside a transaction block' "$REPLAY_LOG"; then
    diagnosis="The marker statement ran inside an incompatible transaction context."
  elif grep -Eiq 'connection refused|context deadline exceeded|i/o timeout|no route to host' "$REPLAY_LOG"; then
    diagnosis="The local Postgres connection was unavailable while setting the one-run marker."
  elif grep -Eiq 'syntax error|invalid value|does not exist' "$REPLAY_LOG"; then
    diagnosis="PostgreSQL rejected the marker SQL or its target database."
  elif grep -Eiq 'unknown flag|flag provided but not defined|unknown command|unknown shorthand|no such command' "$REPLAY_LOG"; then
    diagnosis="The pinned Supabase CLI rejected the local migration replay command or flag."
  elif grep -Eiq 'could not find|not found|not running|connection reset|database system is starting|failed to connect|error connecting' "$REPLAY_LOG"; then
    diagnosis="The pinned Supabase CLI could not resolve or connect to its disposable local Postgres endpoint."
  fi
  printf 'Safe marker diagnosis: %s\n' "$diagnosis" >&2

  python3 - "$REPLAY_LOG" <<'PY' >&2
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
print("Sanitized migration-replay error excerpt:")
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

diagnose_tenant_failure() {
  printf 'The synthetic isolation transaction failed; sanitized PostgreSQL detail follows.\n' >&2

  python3 - "$TENANT_LOG" <<'PY' >&2
from pathlib import Path
import re
import sys

path = Path(sys.argv[1])
if not path.is_file():
    raise SystemExit(0)
matches = [
    line for line in path.read_text(encoding="utf-8", errors="replace").splitlines()
    if re.search(r"error|failed|fatal|denied|cannot|could not|not found|not running|timeout|invalid|refused|sqlstate|exception", line, re.I)
]
print("Sanitized tenant-isolation error excerpt:")
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
  >"$STATUS_LOG" 2>"$STATUS_ERROR_LOG"; then
  fail "The disposable native stack could not be reopened by its project name; CLI output was withheld."
fi

python3 - "$STATUS_LOG" "$PROJECT_ID" "$CI_WORKDIR" "$LOCAL_DB_URL_FILE" <<'PY'
from pathlib import Path
import json
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
import sys

status_path = Path(sys.argv[1])
expected_name = sys.argv[2]
expected_root = Path(sys.argv[3]).resolve()
db_url_path = Path(sys.argv[4])

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
env = report.get("env")
db_url = env.get("DB_URL", "") if isinstance(env, dict) else ""
try:
    parsed_url = urlsplit(db_url)
    port = parsed_url.port
except ValueError:
    parsed_url = None
    port = None
if (
    parsed_url is None
    or parsed_url.scheme not in {"postgres", "postgresql"}
    or parsed_url.hostname not in {"127.0.0.1", "localhost", "::1"}
    or port is None
    or not 1 <= port <= 65535
    or parsed_url.username != "postgres"
    or not parsed_url.password
    or parsed_url.path != "/postgres"
    or parsed_url.fragment
):
    raise SystemExit("The stack did not provide a valid loopback Postgres URL.")
# Supabase CLI's libpq parser gives query parameters precedence over URL userinfo,
# host, port, database, and password. The stack's status URL may include these
# values (for example `user=postgres`), so carrying its query through would
# silently override the validated replay principal. Rebuild a minimal direct
# loopback URL, discard role/host/credential overrides, and retain only the
# explicit local TLS setting. The native stack's supabase_admin login starts
# with current_user=postgres. A direct SET ROLE NONE is intercepted by the
# pinned CLI's lexical migration guard, which immediately reasserts postgres;
# execute it dynamically inside one DO statement so the CLI leaves the
# session-local role reset intact for the following assertions and application
# DDL.
query = urlencode([("sslmode", "disable")])
host = parsed_url.hostname
authority_host = f"[{host}]" if ":" in host else host
userinfo = "supabase_admin"
if parsed_url.password is not None:
    userinfo += f":{parsed_url.password}"
admin_netloc = f"{userinfo}@{authority_host}:{port}"
local_db_url = urlunsplit(parsed_url._replace(netloc=admin_netloc, query=query))
admin_url = urlsplit(local_db_url)
if (
    admin_url.username != "supabase_admin"
    or admin_url.hostname not in {"127.0.0.1", "localhost", "::1"}
    or admin_url.port != port
    or admin_url.path != "/postgres"
    or parse_qsl(admin_url.query) != [("sslmode", "disable")]
):
    raise SystemExit("The reconstructed replay URL did not preserve its pinned local target and principal.")
safe = {
    "name": identity.get("name"),
    "project_root_matches": root_matches,
    "runtime": report.get("runtime"),
    "owner": report.get("owner"),
    "readiness": report.get("readiness"),
    "database_lifecycle": None if database is None else database.get("lifecycle"),
    "database_health": None if database is None else database.get("health"),
    "database_host": parsed_url.hostname,
    "database_port": port,
    "database_user": admin_url.username,
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

# Use the loopback-only URL exported by the exact native stack above. The CLI's
# project-local --local resolver does not reopen this managed native stack in
# this runner, while --db-url can connect to its validated ephemeral endpoint.
LOCAL_DB_URL="$(<"$LOCAL_DB_URL_FILE")"
EXPECTED_LOCAL_PORT="$(python3 - "$LOCAL_DB_URL_FILE" <<'PY'
from pathlib import Path
from urllib.parse import urlsplit
import sys

port = urlsplit(Path(sys.argv[1]).read_text(encoding="utf-8")).port
if port is None:
    raise SystemExit("The reconstructed replay URL lost its pinned port.")
print(port)
PY
)"

# The local stack status returns the shared database password. Use it only on
# the validated loopback URL, and verify the authenticated login identity is
# the built-in `supabase_admin` superuser. Its configured current role may be
# postgres; every temporary migration begins with SET ROLE NONE and checks that
# the effective role is supabase_admin before any application DDL. No role
# memberships or persistent role settings are changed.
if ! ROLE_STATE_CSV="$("$CLI" --workdir "$CI_WORKDIR" --output csv db query \
  --db-url "$LOCAL_DB_URL" \
  "SELECT session_user AS login_role, current_user AS replay_role, (SELECT rolsuper FROM pg_roles WHERE rolname = session_user) AS login_is_superuser, (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS replay_is_superuser, current_setting('role') AS configured_role, COALESCE(inet_server_addr()::text, '') AS server_address, COALESCE(inet_server_port()::text, '') AS server_port;")"; then
  fail "Could not inspect the Supabase platform replay principal on disposable local Postgres."
fi
role_state="$(printf '%s\n' "$ROLE_STATE_CSV" | tail -n 1 | tr -d '\r')"
IFS=, read -r login_role replay_role login_is_superuser replay_is_superuser configured_role server_address server_port <<<"$role_state"
unset ROLE_STATE_CSV
printf 'Detected replay principal: login_role=%s, replay_role=%s, login_superuser=%s, replay_superuser=%s, configured_role=%s, server=%s:%s\n' \
  "$login_role" "$replay_role" "$login_is_superuser" "$replay_is_superuser" "$configured_role" "$server_address" "$server_port"
[[ "$login_role" == "supabase_admin" && "$login_is_superuser" == "true" ]] || \
  fail "The disposable stack login was not the verified Supabase superuser."
if [[ -z "$server_address" && -z "$server_port" ]]; then
  printf 'Verified native database transport: Unix socket on the pinned loopback stack.\n'
elif [[ "$server_address" == "127.0.0.1" && "$server_port" == "$EXPECTED_LOCAL_PORT" ]]; then
  printf 'Verified native database transport: loopback TCP on port %s.\n' "$EXPECTED_LOCAL_PORT"
else
  fail "The replay query did not resolve to the pinned native database transport."
fi
printf 'Sanitized replay login: role=%s, superuser=%s; initial effective role=%s, superuser=%s, configured=%s\n' \
  "$login_role" "$login_is_superuser" "$replay_role" "$replay_is_superuser" "$configured_role"

# Restore the built-in login role only in the current CI session and fail
# before schema DDL if the result is not the expected platform superuser. Keep
# SET ROLE NONE dynamically nested in one DO statement: the pinned CLI only
# recognizes top-level role-reset statements and would otherwise reassert its
# postgres migration role immediately afterward.
python3 - "$ROLE_GUARD_FILE" <<'PY'
from pathlib import Path
import sys

role_guard = b"""DO $ci_supabase_admin_role_guard$
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
"""
destination = Path(sys.argv[1])
with destination.open("xb") as target:
    target.write(role_guard)
destination.chmod(0o600)
PY

# Apply the role-only probe as a temporary migration before copying the
# snapshot. Its dynamic SET ROLE NONE and DO guard contain no application DDL;
# the same guard is prepended to each later temporary migration, so each fresh
# CLI connection revalidates its effective principal.
cp -- "$ROLE_GUARD_FILE" "$CI_WORKDIR/supabase/migrations/$ROLE_PROBE_NAME"
if ! "$CLI" --workdir "$CI_WORKDIR" migration up --db-url "$LOCAL_DB_URL" \
  >"$REPLAY_LOG" 2>&1; then
  diagnose_marker_failure
  fail "The disposable session could not restore and verify the Supabase replay role."
fi

# The native Postgres-only stack intentionally excludes the Auth service, so
# its database may not have Auth's standard auth.jwt() helper installed. The
# application snapshot references that platform helper but does not capture
# the auth schema. Reuse the helper when present; otherwise install the exact
# upstream Supabase Auth implementation only in this disposable CI database.
if ! AUTH_JWT_STATE_CSV="$("$CLI" --workdir "$CI_WORKDIR" --output csv db query \
  --db-url "$LOCAL_DB_URL" \
  "SELECT COALESCE(pg_get_function_result(to_regprocedure('auth.jwt()')) = 'jsonb', false) AS auth_jwt_returns_jsonb;" \
  2>"$AUTH_JWT_ERROR_LOG")"; then
  fail "Could not inspect the disposable database's standard Supabase Auth JWT helper."
fi
auth_jwt_state="$(printf '%s\n' "$AUTH_JWT_STATE_CSV" | tail -n 1 | tr -d '\r')"
unset AUTH_JWT_STATE_CSV
case "$auth_jwt_state" in
  true|t)
    printf 'Verified disposable platform prerequisite: auth.jwt() returns jsonb.\n'
    ;;
  false|f)
    python3 - "$ROLE_GUARD_FILE" "$AUTH_JWT_MIGRATION_FILE" <<'PY'
from pathlib import Path
import sys

role_guard = Path(sys.argv[1]).read_bytes()
destination = Path(sys.argv[2])
auth_jwt = b"""CREATE OR REPLACE FUNCTION auth.jwt()
RETURNS jsonb
LANGUAGE sql STABLE
AS $ci_supabase_auth_jwt$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim', true), ''),
    NULLIF(current_setting('request.jwt.claims', true), '')
  )::jsonb
$ci_supabase_auth_jwt$;
"""
with destination.open("xb") as target:
    target.write(role_guard)
    target.write(auth_jwt)
destination.chmod(0o600)
PY
    cp -- "$AUTH_JWT_MIGRATION_FILE" "$CI_WORKDIR/supabase/migrations/$AUTH_JWT_MIGRATION_NAME"
    if ! "$CLI" --workdir "$CI_WORKDIR" migration up --db-url "$LOCAL_DB_URL" \
      >"$REPLAY_LOG" 2>&1; then
      diagnose_marker_failure
      fail "The standard Supabase Auth JWT prerequisite could not be prepared on disposable Postgres."
    fi
    printf 'Installed the upstream-compatible auth.jwt() helper only in disposable CI Postgres.\n'
    ;;
  *)
    fail "The disposable Auth JWT helper probe returned an unexpected result."
    ;;
esac

# Supply the replay marker after the role guard and before the snapshot. The
# pinned CLI applies migration statements in order on one connection, so the
# marker remains session-local through the baseline's authored BEGIN/COMMIT.
python3 - "$ROOT/supabase/migrations/$MIGRATION_NAME" "$MARKED_BASELINE_FILE" "$ROLE_GUARD_FILE" <<'PY'
from pathlib import Path
import sys

source = Path(sys.argv[1])
destination = Path(sys.argv[2])
role_guard = Path(sys.argv[3]).read_bytes()
sql = source.read_bytes()
if not sql.startswith(b"-- CURRENT-STATE SCHEMA SNAPSHOT;"):
    raise SystemExit("The replay input is not the reviewed current-state baseline.")
with destination.open("xb") as target:
    target.write(role_guard)
    target.write(b"SET app.schema_snapshot_replay = 'ci-empty-replay';\n")
    target.write(sql)
destination.chmod(0o600)
PY

cp -- "$MARKED_BASELINE_FILE" "$CI_WORKDIR/supabase/migrations/$MIGRATION_NAME"
if ! "$CLI" --workdir "$CI_WORKDIR" migration up --db-url "$LOCAL_DB_URL" \
  >"$REPLAY_LOG" 2>&1; then
  diagnose_marker_failure
  fail "The marker-guarded baseline did not replay on disposable local Postgres."
fi

cat -- "$ROLE_GUARD_FILE" "$ROOT/scripts/ci/sandbox-tenant-isolation.sql" \
  >"$CI_WORKDIR/supabase/migrations/$TENANT_MIGRATION_NAME"
chmod 600 "$CI_WORKDIR/supabase/migrations/$TENANT_MIGRATION_NAME"
if ! "$CLI" --workdir "$CI_WORKDIR" migration up --db-url "$LOCAL_DB_URL" \
  >"$TENANT_LOG" 2>&1; then
  diagnose_tenant_failure
  fail "The synthetic two-academy RLS isolation check failed; CLI output was withheld."
fi

cp -- "$MARKED_BASELINE_FILE" "$CI_WORKDIR/supabase/migrations/$GUARD_PROBE_NAME"
if "$CLI" --workdir "$CI_WORKDIR" migration up --db-url "$LOCAL_DB_URL" \
  >"$GUARD_LOG" 2>&1; then
  fail "The current-state baseline unexpectedly allowed replay over an existing schema."
fi
if ! grep -Fq 'Refusing current-state schema baseline' "$GUARD_LOG"; then
  fail "Baseline reapplication failed for a reason other than its empty-schema guard."
fi

rm -- "$CI_WORKDIR/supabase/migrations/$GUARD_PROBE_NAME"
cat -- "$ROLE_GUARD_FILE" "$ROOT/supabase/migrations/$MIGRATION_NAME" \
  >"$CI_WORKDIR/supabase/migrations/$UNMARKED_PROBE_NAME"
chmod 600 "$CI_WORKDIR/supabase/migrations/$UNMARKED_PROBE_NAME"
if "$CLI" --workdir "$CI_WORKDIR" migration up --db-url "$LOCAL_DB_URL" \
  >"$UNMARKED_GUARD_LOG" 2>&1; then
  fail "The current-state baseline unexpectedly ran without its isolated CI marker."
fi
if ! grep -Fq 'isolated CI replay marker is missing' "$UNMARKED_GUARD_LOG"; then
  fail "Baseline reapplication without the marker failed for an unexpected reason."
fi

printf 'PASS: current-state snapshot replayed on an empty disposable Postgres database.\n'
printf 'PASS: synthetic two-academy RLS reads, writes, and rollback were verified.\n'
printf 'PASS: baseline guards refused populated and unmarked databases before DDL.\n'
unset LOCAL_DB_URL
unset EXPECTED_LOCAL_PORT
