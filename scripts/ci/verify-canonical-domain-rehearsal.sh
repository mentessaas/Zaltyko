#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

# Executes only a guarded, transactional schema rehearsal on the workflow's
# synthetic PostgreSQL service. This is not a migration or an apply command.
readonly EXPECTED_BRANCH="codex/mvp-main-bridge-20261025"
readonly EXPECTED_SNAPSHOT_SHA256="fd1bf2597b0dfd40dc6db824fa24773461f2776fa2ed7c994649be534c6a4b36"
readonly EXPECTED_TENANT_FIXTURE_SHA256="04dd16835406198d3ebb12f3396674bbc279e5dcd7500e5c30fefb24a2bf6d4c"
readonly ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
readonly TENANT_FIXTURE="$ROOT/scripts/ci/canonical-domain-tenant-isolation.sql"

fail() {
  printf 'Canonical rehearsal refused: %s\n' "$1" >&2
  exit 1
}

fail_with_safe_log_lines() {
  local message="$1"
  local log_file="$2"
  printf 'Canonical rehearsal refused: %s\n' "$message" >&2
  if [[ -f "$log_file" ]]; then
    awk '
      /ERROR:/ {
        line = $0
        sub(/^.*ERROR:[[:space:]]*/, "ERROR: ", line)
        print substr(line, 1, 400)
        emitted++
      }
      /Canonical rehearsal refused/ && $0 !~ /ERROR:/ {
        line = $0
        sub(/^.*Canonical rehearsal refused/, "Canonical rehearsal refused", line)
        print substr(line, 1, 400)
        emitted++
      }
      emitted >= 8 { exit }
    ' "$log_file" >&2
  fi
  exit 1
}

[[ "${GITHUB_ACTIONS:-}" == "true" ]] || fail "GitHub Actions is required."
[[ "${RUNNER_OS:-}" == "Linux" && "$(uname -s)" == "Linux" ]] || fail "A disposable Linux runner is required."
[[ "$(id -u)" -ne 0 ]] || fail "The runner must not execute as root."
[[ "${CANONICAL_DOMAIN_REHEARSAL_CI:-}" == "1" ]] || fail "The explicit rehearsal workflow marker is missing."
[[ "${GITHUB_REF:-}" == "refs/heads/$EXPECTED_BRANCH" ]] || fail "Unexpected workflow branch."
[[ "${RUNNER_TEMP:-}" != "" && -d "$RUNNER_TEMP" ]] || fail "RUNNER_TEMP must be an existing directory."
[[ "$#" -le 2 ]] || fail "Usage: verify-canonical-domain-rehearsal.sh [artifacts/canonical-domain-rehearsal.sql] [artifacts/canonical-domain-proposal.json]"
[[ "${GITHUB_SHA:-}" =~ ^[0-9a-f]{40}$ ]] || fail "A full GitHub commit identity is required."
[[ "$(git -C "$ROOT" rev-parse HEAD)" == "$GITHUB_SHA" ]] || fail "The checked-out commit differs from the workflow commit."
[[ "$(realpath -e -- "${GITHUB_WORKSPACE:-$ROOT}")" == "$ROOT" ]] || fail "GITHUB_WORKSPACE does not match this checkout."

for forbidden in \
  DATABASE_URL DATABASE_URL_POOL DATABASE_URL_DIRECT SUPABASE_DB_URL SUPABASE_DB_PASSWORD \
  SUPABASE_ACCESS_TOKEN SUPABASE_PROJECT_REF SUPABASE_SERVICE_ROLE_KEY \
  E2E_TARGET_SUPABASE_PROJECT_REF STRIPE_SECRET_KEY STRIPE_SAAS_TEST_SECRET_KEY \
  STRIPE_SAAS_LIVE_SECRET_KEY VERCEL_TOKEN; do
  [[ -z "${!forbidden:-}" ]] || fail "Unexpected external database/provider credential in runner environment."
done

[[ -n "${CANONICAL_REHEARSAL_DATABASE_URL:-}" ]] || fail "The isolated rehearsal connection URL is missing."
command -v psql >/dev/null 2>&1 || fail "psql is not available on the disposable runner."
command -v python3 >/dev/null 2>&1 || fail "Python 3 is required for URL and artifact guards."
command -v sha256sum >/dev/null 2>&1 || fail "sha256sum is required for artifact provenance."

# Remove libpq service/host overrides so the URI is the only connection source.
unset PGHOST PGHOSTADDR PGPORT PGDATABASE PGUSER PGPASSWORD PGSERVICE PGSERVICEFILE PGPASSFILE PGOPTIONS PGSSLMODE PGTARGETSESSIONATTRS || true

readonly SQL_REL="${1:-artifacts/canonical-domain-rehearsal.sql}"
readonly MANIFEST_REL="${2:-artifacts/canonical-domain-proposal.json}"
readonly SQL_FILE="$ROOT/$SQL_REL"
readonly MANIFEST_FILE="$ROOT/$MANIFEST_REL"
readonly ARTIFACT_DIR="$ROOT/artifacts"
readonly RUN_DIR="$(mktemp -d "$RUNNER_TEMP/canonical-domain-rehearsal.XXXXXX")"
readonly SETUP_SQL="$RUN_DIR/setup-canaries.sql"
readonly ASSERT_SQL="$RUN_DIR/assert-rehearsal.sql"
readonly REHEARSAL_SQL="$RUN_DIR/canonical-domain-rehearsal-ci.sql"
readonly GUARD_SQL="$RUN_DIR/canonical-domain-existing-schema-guard-ci.sql"
readonly SETUP_LOG="$RUN_DIR/setup.log"
readonly REHEARSAL_LOG="$RUN_DIR/rehearsal.log"
readonly GUARD_LOG="$RUN_DIR/existing-schema-guard.log"
readonly VERIFY_LOG="$RUN_DIR/verify.log"
trap 'rm -rf -- "$RUN_DIR"' EXIT

[[ -d "$ARTIFACT_DIR" ]] || fail "The artifact directory is missing; generate the review artefact first."
[[ -f "$SQL_FILE" && ! -L "$SQL_FILE" ]] || fail "The generated rehearsal SQL is missing or is a symlink."
[[ -f "$MANIFEST_FILE" && ! -L "$MANIFEST_FILE" ]] || fail "The generator manifest is missing or is a symlink."
[[ -f "$TENANT_FIXTURE" && ! -L "$TENANT_FIXTURE" ]] || fail "The reviewed synthetic tenant fixture is missing or is a symlink."

python3 - "$CANONICAL_REHEARSAL_DATABASE_URL" <<'PY'
from urllib.parse import parse_qsl, unquote, urlsplit
import sys

url = sys.argv[1]
parts = urlsplit(url)
expected = {
    "scheme": "postgresql",
    "host": "127.0.0.1",
    "port": 55432,
    "username": "postgres",
    "password": "ci_only_no_external_access",
    "database": "/zaltyko_canonical_rehearsal_ci",
    "query": [("sslmode", "disable")],
}
actual = {
    "scheme": parts.scheme,
    "host": (parts.hostname or "").lower(),
    "port": parts.port,
    "username": unquote(parts.username or ""),
    "password": unquote(parts.password or ""),
    "database": unquote(parts.path),
    "query": sorted(parse_qsl(parts.query, keep_blank_values=True)),
}
expected["query"] = sorted(expected["query"])
if actual != expected:
    raise SystemExit("The rehearsal URL is not the exact synthetic loopback database target.")
PY

python3 - "$ROOT" "$SQL_FILE" "$MANIFEST_FILE" "$TENANT_FIXTURE" "$REHEARSAL_SQL" "$GUARD_SQL" "$GITHUB_SHA" "$EXPECTED_SNAPSHOT_SHA256" "$EXPECTED_TENANT_FIXTURE_SHA256" <<'PY'
from hashlib import sha256
import json
import re
from pathlib import Path
import sys

root = Path(sys.argv[1]).resolve()
sql_path = Path(sys.argv[2]).resolve(strict=True)
manifest_path = Path(sys.argv[3]).resolve(strict=True)
fixture_path = Path(sys.argv[4]).resolve(strict=True)
rehearsal_path = Path(sys.argv[5])
guard_path = Path(sys.argv[6])
commit = sys.argv[7]
snapshot_sha = sys.argv[8]
fixture_sha = sys.argv[9]

expected_sql = root / "artifacts/canonical-domain-rehearsal.sql"
expected_manifest = root / "artifacts/canonical-domain-proposal.json"
expected_fixture = root / "scripts/ci/canonical-domain-tenant-isolation.sql"
if sql_path != expected_sql or manifest_path != expected_manifest or fixture_path != expected_fixture:
    raise SystemExit("The rehearsal inputs differ from the approved artifact and fixture paths.")

try:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    sql = sql_path.read_text(encoding="utf-8")
    fixture = fixture_path.read_text(encoding="utf-8")
    fixture_bytes = fixture_path.read_bytes()
except (OSError, UnicodeError, json.JSONDecodeError):
    raise SystemExit("The rehearsal artifact, manifest, or synthetic tenant fixture is unreadable.")

record = manifest.get("sqlRehearsal")
source = manifest.get("source")
scope = manifest.get("scope")
if not isinstance(record, dict) or not isinstance(source, dict) or not isinstance(scope, dict):
    raise SystemExit("The generator manifest is missing rehearsal provenance fields.")
if record.get("path") != "artifacts/canonical-domain-rehearsal.sql":
    raise SystemExit("The generator manifest names a different SQL artifact.")
if record.get("sha256") != sha256(sql.encode("utf-8")).hexdigest():
    raise SystemExit("The SQL artifact does not match its generator-manifest SHA-256.")
if source.get("snapshotSha256") != snapshot_sha:
    raise SystemExit("The SQL artifact was not generated from the pinned sandbox schema snapshot.")
if manifest.get("candidateCommit") != commit:
    raise SystemExit("The generator manifest commit differs from this workflow commit.")
if manifest.get("applyReady") is not False:
    raise SystemExit("The generated SQL must remain explicitly not apply-ready.")
for claim in ("historicalMigrationHistoryRecovered", "applicationRowsRead", "secretsReadOrIncluded"):
    if source.get(claim) is not False:
        raise SystemExit("The manifest must preserve the snapshot's no-history/no-rows/no-secrets boundary.")
if scope.get("includedSchemas") != ["zaltyko", "zaltyko_domain_private"]:
    raise SystemExit("The rehearsal scope must be limited to the two canonical schemas.")
if sha256(fixture_bytes).hexdigest() != fixture_sha:
    raise SystemExit("The synthetic tenant fixture differs from its pinned CI source hash.")

lines = sql.splitlines()
non_comments = [line.strip() for line in lines if line.strip() and not line.lstrip().startswith("--")]
if not non_comments or non_comments[0].upper() != "BEGIN;":
    raise SystemExit("The rehearsal SQL must start with BEGIN.")
if not non_comments[-1].upper() == "ROLLBACK;":
    raise SystemExit("The rehearsal SQL must end with ROLLBACK.")
if len(re.findall(r"(?im)^\s*ROLLBACK\s*;\s*$", sql)) != 1:
    raise SystemExit("The rehearsal SQL must contain exactly one final ROLLBACK.")
if re.search(r"(?im)^\s*COMMIT\s*;\s*$", sql):
    raise SystemExit("COMMIT is forbidden in the generated rehearsal SQL.")
if re.search(r"(?m)^\s*\\", sql):
    raise SystemExit("psql meta-commands are forbidden in the generated SQL.")
if "-- CI-ONLY CANONICAL DOMAIN REHEARSAL" not in "\n".join(lines[:20]):
    raise SystemExit("The explicit CI-only SQL header marker is missing.")
if not re.search(
    r"(?im)^\s*SET\s+LOCAL\s+app\.canonical_domain_rehearsal\s*=\s*'ci-explicit'\s*;\s*$",
    sql,
):
    raise SystemExit("The transaction-local rehearsal marker is missing.")
if "zaltyko_canonical_rehearsal_ci" not in sql:
    raise SystemExit("The SQL must guard the exact disposable database name.")

fixture_lines = fixture.splitlines()
if re.search(r"(?im)^\s*(?:BEGIN|COMMIT|ROLLBACK)\s*;\s*$", fixture):
    raise SystemExit("The synthetic tenant fixture must be a body fragment without transaction control.")
if re.search(r"(?m)^\s*\\", fixture):
    raise SystemExit("psql meta-commands are forbidden in the synthetic tenant fixture.")
if "70000000-0000-4000-8000-000000000101" not in fixture or "70000000-0000-4000-8000-000000000102" not in fixture:
    raise SystemExit("The tenant fixture must use the pinned synthetic organization IDs.")

rollback = re.search(r"(?im)^\s*ROLLBACK\s*;\s*$", sql)
assert rollback is not None
prefix = sql[: rollback.start()]
suffix = sql[rollback.end() :]
if suffix.strip():
    raise SystemExit("Unexpected content follows the final ROLLBACK.")

assertions = """\
DO $canonical_domain_rehearsal_assertions$
DECLARE
  v_tables integer;
  v_forced_tables integer;
  v_policies integer;
  v_functions integer;
  v_enums integer;
  v_definers integer;
  v_definer_search_paths integer;
  v_functions_with_search_path integer;
  v_non_postgres_owners integer;
  v_definer_names text[];
  v_bad integer;
  v_owner_function_grants integer;
  v_public_exec text[];
  v_anon_exec text[];
  v_authenticated_exec text[];
  v_service_exec text[];
  v_public_canary_table_acl text[];
  v_public_canary_function_acl text[];
  v_private_canary_authenticated_table_acl text[];
  v_private_canary_service_table_acl text[];
  v_private_canary_function_acl text[];
  v_public_canary_owner_table_acl text[];
  v_private_canary_owner_table_acl text[];
  v_public_canary_owner_function_acl text[];
  v_private_canary_owner_function_acl text[];
  v_service_table_acl text[];
  v_authenticated_table_acl text[];
  v_anon_table_acl text[];
  v_owner_table_acl text[];
  v_default_table_acl text[];
  v_default_sequence_acl text[];
  v_default_acl_rows integer;
  v_membership_owner_select boolean;
  v_membership_authenticated_select boolean;
BEGIN
  IF current_database() <> 'zaltyko_canonical_rehearsal_ci'
     OR current_setting('app.canonical_domain_rehearsal', true) IS DISTINCT FROM 'ci-explicit' THEN
    RAISE EXCEPTION 'Canonical rehearsal database or marker guard failed';
  END IF;

  SELECT count(*), count(*) FILTER (WHERE c.relrowsecurity AND c.relforcerowsecurity)
    INTO v_tables, v_forced_tables
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'zaltyko' AND c.relkind = 'r';
  IF v_tables <> 92 OR v_forced_tables <> 92 THEN
    RAISE EXCEPTION 'Canonical table/RLS inventory mismatch';
  END IF;

  SELECT count(*) INTO v_policies
  FROM pg_policies WHERE schemaname = 'zaltyko';
  IF v_policies <> 64 THEN
    RAISE EXCEPTION 'Canonical RLS policy inventory mismatch';
  END IF;

  SELECT count(*), count(*) FILTER (WHERE p.prosecdef),
         count(*) FILTER (WHERE p.prosecdef AND COALESCE(p.proconfig, ARRAY[]::text[]) @> ARRAY['search_path=""']),
         count(*) FILTER (WHERE EXISTS (
           SELECT 1 FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) AS setting
           WHERE setting LIKE 'search_path=%'
         )),
         count(*) FILTER (WHERE pg_get_userbyid(p.proowner) <> 'postgres')
    INTO v_functions, v_definers, v_definer_search_paths, v_functions_with_search_path, v_non_postgres_owners
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname IN ('zaltyko', 'zaltyko_domain_private') AND p.prokind = 'f';
  IF v_functions <> 16 OR v_definers <> 4 OR v_definer_search_paths <> 4
     OR v_functions_with_search_path <> 16 OR v_non_postgres_owners <> 0 THEN
    RAISE EXCEPTION 'Canonical routine count, owner, or search_path inventory mismatch';
  END IF;

  SELECT count(*), count(*) FILTER (WHERE
    pg_get_userbyid(t.typowner) <> 'postgres'
    OR (SELECT count(*) FROM aclexplode(COALESCE(t.typacl, acldefault('T', t.typowner)))) <> 2
    OR NOT EXISTS (
      SELECT 1 FROM aclexplode(COALESCE(t.typacl, acldefault('T', t.typowner))) a
      WHERE a.grantee = t.typowner AND a.privilege_type = 'USAGE' AND NOT a.is_grantable
    )
    OR NOT EXISTS (
      SELECT 1 FROM aclexplode(COALESCE(t.typacl, acldefault('T', t.typowner))) a
      WHERE a.grantee = 0 AND a.privilege_type = 'USAGE' AND NOT a.is_grantable
    )
    OR EXISTS (
      SELECT 1 FROM aclexplode(COALESCE(t.typacl, acldefault('T', t.typowner))) a
      WHERE a.grantee NOT IN (0, t.typowner)
         OR a.privilege_type <> 'USAGE'
         OR a.is_grantable
    ))
    INTO v_enums, v_bad
  FROM pg_type t
  JOIN pg_namespace n ON n.oid = t.typnamespace
  WHERE n.nspname = 'zaltyko' AND t.typtype = 'e';
  IF v_enums <> 61 OR v_bad <> 0 THEN
    RAISE EXCEPTION 'Canonical enum owner/PUBLIC USAGE ACL inventory mismatch';
  END IF;

  SELECT array_agg(format('%I.%I', n.nspname, p.proname) ORDER BY n.nspname, p.proname)
    INTO v_definer_names
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname IN ('zaltyko', 'zaltyko_domain_private') AND p.prokind = 'f' AND p.prosecdef;
  IF v_definer_names IS DISTINCT FROM ARRAY[
      'zaltyko_domain_private.has_location_access',
      'zaltyko_domain_private.has_organization_access',
      'zaltyko_domain_private.reject_audit_mutation',
      'zaltyko_domain_private.reject_insight_history_mutation'
    ]::text[] THEN
    RAISE EXCEPTION 'Canonical SECURITY DEFINER name allowlist mismatch';
  END IF;

  SELECT array_agg(format('%I.%I', n.nspname, p.proname) ORDER BY n.nspname, p.proname)
    INTO v_public_exec
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
  WHERE n.nspname IN ('zaltyko', 'zaltyko_domain_private')
    AND p.prokind = 'f' AND a.grantee = 0 AND a.privilege_type = 'EXECUTE';
  IF v_public_exec IS DISTINCT FROM ARRAY[
      'zaltyko.guard_saas_reconciliation_result_insert',
      'zaltyko.guard_saas_webhook_requeue'
    ]::text[] THEN
    RAISE EXCEPTION 'Canonical PUBLIC EXECUTE allowlist mismatch';
  END IF;

  SELECT array_agg(format('%I.%I', n.nspname, p.proname) ORDER BY n.nspname, p.proname)
    INTO v_anon_exec
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
  WHERE n.nspname IN ('zaltyko', 'zaltyko_domain_private')
    AND p.prokind = 'f' AND a.grantee = 'anon'::regrole AND a.privilege_type = 'EXECUTE';
  IF v_anon_exec IS NOT NULL THEN
    RAISE EXCEPTION 'Canonical anon EXECUTE ACL is not empty';
  END IF;

  SELECT array_agg(format('%I.%I', n.nspname, p.proname) ORDER BY n.nspname, p.proname)
    INTO v_authenticated_exec
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
  WHERE n.nspname IN ('zaltyko', 'zaltyko_domain_private')
    AND p.prokind = 'f' AND a.grantee = 'authenticated'::regrole AND a.privilege_type = 'EXECUTE';
  IF v_authenticated_exec IS DISTINCT FROM ARRAY[
      'zaltyko_domain_private.has_location_access',
      'zaltyko_domain_private.has_organization_access'
    ]::text[] THEN
    RAISE EXCEPTION 'Canonical authenticated EXECUTE allowlist mismatch';
  END IF;

  SELECT array_agg(format('%I.%I', n.nspname, p.proname) ORDER BY n.nspname, p.proname)
    INTO v_service_exec
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
  WHERE n.nspname IN ('zaltyko', 'zaltyko_domain_private')
    AND p.prokind = 'f' AND a.grantee = 'service_role'::regrole AND a.privilege_type = 'EXECUTE';
  IF v_service_exec IS DISTINCT FROM ARRAY[
      'zaltyko_domain_private.has_location_access',
      'zaltyko_domain_private.has_organization_access'
    ]::text[] THEN
    RAISE EXCEPTION 'Canonical service_role EXECUTE allowlist mismatch';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
    WHERE n.nspname IN ('zaltyko', 'zaltyko_domain_private') AND p.prokind = 'f'
      AND a.grantee NOT IN (0, p.proowner, 'anon'::regrole, 'authenticated'::regrole, 'service_role'::regrole)
  ) THEN
    RAISE EXCEPTION 'Unexpected role received a canonical routine privilege';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_namespace n
    WHERE n.nspname IN ('zaltyko', 'zaltyko_domain_private')
      AND (pg_get_userbyid(n.nspowner) <> 'postgres'
        OR EXISTS (SELECT 1 FROM aclexplode(COALESCE(n.nspacl, acldefault('n', n.nspowner))) a WHERE a.grantee = 0)
        OR EXISTS (SELECT 1 FROM aclexplode(COALESCE(n.nspacl, acldefault('n', n.nspowner))) a WHERE a.grantee = 'anon'::regrole)
        OR NOT EXISTS (SELECT 1 FROM aclexplode(COALESCE(n.nspacl, acldefault('n', n.nspowner))) a WHERE a.grantee = 'authenticated'::regrole AND a.privilege_type = 'USAGE')
        OR NOT EXISTS (SELECT 1 FROM aclexplode(COALESCE(n.nspacl, acldefault('n', n.nspowner))) a WHERE a.grantee = 'service_role'::regrole AND a.privilege_type = 'USAGE')
        OR EXISTS (SELECT 1 FROM aclexplode(COALESCE(n.nspacl, acldefault('n', n.nspowner))) a WHERE a.grantee IN ('authenticated'::regrole, 'service_role'::regrole) AND a.privilege_type <> 'USAGE')
        OR NOT EXISTS (SELECT 1 FROM aclexplode(COALESCE(n.nspacl, acldefault('n', n.nspowner))) a WHERE a.grantee = n.nspowner AND a.privilege_type = 'USAGE'))
  ) THEN
    RAISE EXCEPTION 'Canonical schema owner or explicit USAGE ACL mismatch';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_namespace n
    CROSS JOIN LATERAL aclexplode(COALESCE(n.nspacl, acldefault('n', n.nspowner))) a
    WHERE n.nspname IN ('zaltyko', 'zaltyko_domain_private')
      AND a.grantee NOT IN (0, n.nspowner, 'anon'::regrole, 'authenticated'::regrole, 'service_role'::regrole)
  ) THEN
    RAISE EXCEPTION 'Unexpected role received canonical schema privileges';
  END IF;

  SELECT count(*) INTO v_owner_function_grants
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
  WHERE n.nspname IN ('zaltyko', 'zaltyko_domain_private')
    AND p.prokind = 'f' AND a.grantee = p.proowner AND a.privilege_type = 'EXECUTE';
  IF v_owner_function_grants <> 16 THEN
    RAISE EXCEPTION 'Canonical routine owner EXECUTE ACL is incomplete';
  END IF;

  SELECT count(*) INTO v_default_acl_rows
  FROM pg_default_acl;
  IF v_default_acl_rows <> 2
     OR EXISTS (
       SELECT 1 FROM pg_default_acl d
       LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace
       WHERE n.nspname IS DISTINCT FROM 'zaltyko'
          OR d.defaclrole <> 'postgres'::regrole
          OR d.defaclobjtype NOT IN ('r', 'S')
     )
     OR EXISTS (
       SELECT 1 FROM pg_default_acl d
       WHERE d.defaclnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'zaltyko')
         AND d.defaclobjtype NOT IN ('r', 'S')
     ) THEN
    RAISE EXCEPTION 'Canonical default ACL scope or object inventory mismatch';
  END IF;
  SELECT array_agg(DISTINCT a.privilege_type ORDER BY a.privilege_type) INTO v_default_table_acl
  FROM pg_default_acl d
  JOIN pg_namespace n ON n.oid = d.defaclnamespace
  CROSS JOIN LATERAL aclexplode(d.defaclacl) a
  WHERE n.nspname = 'zaltyko' AND d.defaclrole = 'postgres'::regrole
    AND d.defaclobjtype = 'r' AND a.grantee = 'service_role'::regrole AND NOT a.is_grantable;
  SELECT array_agg(DISTINCT a.privilege_type ORDER BY a.privilege_type) INTO v_default_sequence_acl
  FROM pg_default_acl d
  JOIN pg_namespace n ON n.oid = d.defaclnamespace
  CROSS JOIN LATERAL aclexplode(d.defaclacl) a
  WHERE n.nspname = 'zaltyko' AND d.defaclrole = 'postgres'::regrole
    AND d.defaclobjtype = 'S' AND a.grantee = 'service_role'::regrole AND NOT a.is_grantable;
  IF v_default_table_acl IS DISTINCT FROM ARRAY[
       'DELETE', 'INSERT', 'MAINTAIN', 'REFERENCES', 'SELECT', 'TRIGGER', 'TRUNCATE', 'UPDATE'
     ]::text[]
     OR v_default_sequence_acl IS DISTINCT FROM ARRAY['SELECT', 'UPDATE', 'USAGE']::text[]
     OR EXISTS (
       SELECT 1 FROM pg_default_acl d
       CROSS JOIN LATERAL aclexplode(d.defaclacl) a
       WHERE (a.grantee <> 'service_role'::regrole AND a.grantee <> d.defaclrole) OR a.is_grantable
     ) THEN
    RAISE EXCEPTION 'Canonical service_role default ACL grants mismatch';
  END IF;

  IF has_function_privilege('anon', 'zaltyko_domain_private.has_organization_access(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'zaltyko_domain_private.has_location_access(uuid,uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'zaltyko_domain_private.has_organization_access(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'zaltyko_domain_private.has_location_access(uuid,uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'zaltyko_domain_private.has_organization_access(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'zaltyko_domain_private.has_location_access(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Canonical access-helper effective EXECUTE ACL mismatch';
  END IF;

  IF NOT has_table_privilege('service_role', 'zaltyko.organizations', 'SELECT')
     OR NOT has_table_privilege('service_role', 'zaltyko.organizations', 'INSERT')
     OR NOT has_table_privilege('service_role', 'zaltyko.organizations', 'UPDATE')
     OR NOT has_table_privilege('service_role', 'zaltyko.organizations', 'DELETE')
     OR has_table_privilege('anon', 'zaltyko.organizations', 'SELECT')
     OR has_table_privilege('anon', 'zaltyko.organizations', 'INSERT')
     OR has_table_privilege('anon', 'zaltyko.organizations', 'UPDATE')
     OR has_table_privilege('anon', 'zaltyko.organizations', 'DELETE') THEN
    RAISE EXCEPTION 'Canonical organizations table ACL mismatch';
  END IF;

  SELECT array_agg(DISTINCT a.privilege_type ORDER BY a.privilege_type) INTO v_service_table_acl
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) a
  WHERE n.nspname = 'zaltyko' AND c.relname = 'organizations'
    AND a.grantee = 'service_role'::regrole;
  SELECT array_agg(DISTINCT a.privilege_type ORDER BY a.privilege_type) INTO v_authenticated_table_acl
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) a
  WHERE n.nspname = 'zaltyko' AND c.relname = 'organizations'
    AND a.grantee = 'authenticated'::regrole;
  SELECT array_agg(DISTINCT a.privilege_type ORDER BY a.privilege_type) INTO v_anon_table_acl
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) a
  WHERE n.nspname = 'zaltyko' AND c.relname = 'organizations'
    AND a.grantee IN (0, 'anon'::regrole);
  SELECT array_agg(DISTINCT a.privilege_type ORDER BY a.privilege_type) INTO v_owner_table_acl
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) a
  WHERE n.nspname = 'zaltyko' AND c.relname = 'organizations'
    AND a.grantee = c.relowner;
  IF v_service_table_acl IS DISTINCT FROM ARRAY[
       'DELETE', 'INSERT', 'MAINTAIN', 'REFERENCES', 'SELECT', 'TRIGGER', 'TRUNCATE', 'UPDATE'
     ]::text[]
     OR v_authenticated_table_acl IS DISTINCT FROM ARRAY['SELECT']::text[]
     OR v_anon_table_acl IS NOT NULL
     OR v_owner_table_acl IS DISTINCT FROM ARRAY[
       'DELETE', 'INSERT', 'MAINTAIN', 'REFERENCES', 'SELECT', 'TRIGGER', 'TRUNCATE', 'UPDATE'
     ]::text[]
     OR EXISTS (
       SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname IN ('zaltyko', 'zaltyko_domain_private')
         AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
         AND pg_get_userbyid(c.relowner) <> 'postgres'
     ) THEN
    RAISE EXCEPTION 'Canonical organizations or table-owner explicit ACL inventory mismatch';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) a
    WHERE n.nspname = 'zaltyko' AND c.relname = 'organization_members'
      AND a.grantee = c.relowner AND a.privilege_type = 'SELECT'
  ), EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) a
    WHERE n.nspname = 'zaltyko' AND c.relname = 'organization_members'
      AND a.grantee = 'authenticated'::regrole AND a.privilege_type = 'SELECT'
  ) INTO v_membership_owner_select, v_membership_authenticated_select;
  IF NOT v_membership_owner_select OR NOT v_membership_authenticated_select THEN
    RAISE EXCEPTION 'Canonical organization_members owner/authenticated SELECT ACL is incomplete';
  END IF;

  SELECT count(*) INTO v_bad
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) a
  WHERE n.nspname IN ('zaltyko', 'zaltyko_domain_private')
    AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
    AND a.grantee IN (0, 'anon'::regrole);
  IF v_bad <> 0 THEN
    RAISE EXCEPTION 'anon has an unexpected canonical table privilege';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) a
    WHERE n.nspname IN ('zaltyko', 'zaltyko_domain_private')
      AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
      AND a.grantee NOT IN (0, c.relowner, 'anon'::regrole, 'authenticated'::regrole, 'service_role'::regrole)
  ) THEN
    RAISE EXCEPTION 'Unexpected role received canonical table privileges';
  END IF;

  SELECT array_agg(DISTINCT a.privilege_type ORDER BY a.privilege_type) INTO v_public_canary_table_acl
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) a
  WHERE n.nspname = 'public' AND c.relname = 'canonical_domain_rehearsal_canary'
    AND a.grantee = 'authenticated'::regrole;
  SELECT array_agg(DISTINCT a.privilege_type ORDER BY a.privilege_type) INTO v_public_canary_function_acl
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
  WHERE n.nspname = 'public' AND p.proname = 'canonical_domain_rehearsal_canary'
    AND a.grantee = 'authenticated'::regrole;
  SELECT array_agg(DISTINCT a.privilege_type ORDER BY a.privilege_type) INTO v_private_canary_authenticated_table_acl
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) a
  WHERE n.nspname = 'zaltyko_private' AND c.relname = 'canonical_domain_rehearsal_canary'
    AND a.grantee = 'authenticated'::regrole;
  SELECT array_agg(DISTINCT a.privilege_type ORDER BY a.privilege_type) INTO v_private_canary_service_table_acl
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) a
  WHERE n.nspname = 'zaltyko_private' AND c.relname = 'canonical_domain_rehearsal_canary'
    AND a.grantee = 'service_role'::regrole;
  SELECT array_agg(DISTINCT a.privilege_type ORDER BY a.privilege_type) INTO v_private_canary_function_acl
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
  WHERE n.nspname = 'zaltyko_private' AND p.proname = 'canonical_domain_rehearsal_canary'
    AND a.grantee = 'authenticated'::regrole;
  SELECT array_agg(DISTINCT a.privilege_type ORDER BY a.privilege_type) INTO v_public_canary_owner_table_acl
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) a
  WHERE n.nspname = 'public' AND c.relname = 'canonical_domain_rehearsal_canary'
    AND a.grantee = c.relowner;
  SELECT array_agg(DISTINCT a.privilege_type ORDER BY a.privilege_type) INTO v_private_canary_owner_table_acl
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) a
  WHERE n.nspname = 'zaltyko_private' AND c.relname = 'canonical_domain_rehearsal_canary'
    AND a.grantee = c.relowner;
  SELECT array_agg(DISTINCT a.privilege_type ORDER BY a.privilege_type) INTO v_public_canary_owner_function_acl
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
  WHERE n.nspname = 'public' AND p.proname = 'canonical_domain_rehearsal_canary'
    AND a.grantee = p.proowner;
  SELECT array_agg(DISTINCT a.privilege_type ORDER BY a.privilege_type) INTO v_private_canary_owner_function_acl
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
  WHERE n.nspname = 'zaltyko_private' AND p.proname = 'canonical_domain_rehearsal_canary'
    AND a.grantee = p.proowner;
  IF v_public_canary_table_acl IS DISTINCT FROM ARRAY['SELECT']::text[]
     OR v_public_canary_function_acl IS DISTINCT FROM ARRAY['EXECUTE']::text[]
     OR v_private_canary_authenticated_table_acl IS DISTINCT FROM ARRAY['SELECT']::text[]
     OR v_private_canary_service_table_acl IS DISTINCT FROM ARRAY['SELECT']::text[]
     OR v_private_canary_function_acl IS DISTINCT FROM ARRAY['EXECUTE']::text[]
     OR v_public_canary_owner_table_acl IS DISTINCT FROM ARRAY[
       'DELETE', 'INSERT', 'MAINTAIN', 'REFERENCES', 'SELECT', 'TRIGGER', 'TRUNCATE', 'UPDATE'
     ]::text[]
     OR v_private_canary_owner_table_acl IS DISTINCT FROM ARRAY[
       'DELETE', 'INSERT', 'MAINTAIN', 'REFERENCES', 'SELECT', 'TRIGGER', 'TRUNCATE', 'UPDATE'
     ]::text[]
     OR v_public_canary_owner_function_acl IS DISTINCT FROM ARRAY['EXECUTE']::text[]
     OR v_private_canary_owner_function_acl IS DISTINCT FROM ARRAY['EXECUTE']::text[]
     OR EXISTS (
       SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) a
       WHERE ((n.nspname = 'public' AND c.relname = 'canonical_domain_rehearsal_canary')
           OR (n.nspname = 'zaltyko_private' AND c.relname = 'canonical_domain_rehearsal_canary'))
         AND (a.grantee = 0 OR a.grantee = 'anon'::regrole)
     )
     OR EXISTS (
       SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
       WHERE ((n.nspname = 'public' AND p.proname = 'canonical_domain_rehearsal_canary')
           OR (n.nspname = 'zaltyko_private' AND p.proname = 'canonical_domain_rehearsal_canary'))
         AND (a.grantee = 0 OR a.grantee = 'anon'::regrole OR a.grantee = 'service_role'::regrole)
     ) THEN
    RAISE EXCEPTION 'Synthetic canary direct ACLs changed';
  END IF;

  IF to_regclass('zaltyko_domain_private.e2e_schema_migrations') IS NOT NULL THEN
    RAISE EXCEPTION 'The E2E ledger must not enter the canonical rehearsal';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE NOT t.tgisinternal AND n.nspname = 'zaltyko'
      AND ((t.tgname = 'organization_saas_webhook_requeue_guard'
            AND c.relname = 'organization_saas_webhook_events'
            AND p.proname = 'guard_saas_webhook_requeue')
        OR (t.tgname = 'saas_webhook_reconciliation_result_insert_guard'
            AND c.relname = 'organization_saas_webhook_reconciliation_results'
            AND p.proname = 'guard_saas_reconciliation_result_insert'))
  ) THEN
    IF (SELECT count(*) FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_proc p ON p.oid = t.tgfoid
        WHERE NOT t.tgisinternal AND n.nspname = 'zaltyko'
          AND ((t.tgname = 'organization_saas_webhook_requeue_guard'
                AND c.relname = 'organization_saas_webhook_events'
                AND p.proname = 'guard_saas_webhook_requeue')
            OR (t.tgname = 'saas_webhook_reconciliation_result_insert_guard'
                AND c.relname = 'organization_saas_webhook_reconciliation_results'
                AND p.proname = 'guard_saas_reconciliation_result_insert'))) <> 2 THEN
      RAISE EXCEPTION 'PUBLIC trigger-only guard binding mismatch';
    END IF;
  ELSE
    RAISE EXCEPTION 'PUBLIC trigger-only guard bindings are missing';
  END IF;
END
$canonical_domain_rehearsal_assertions$;
"""

if re.search(r"(?im)^\s*ROLLBACK\s*;", fixture) or re.search(r"(?im)^\s*COMMIT\s*;", fixture):
    raise SystemExit("Transaction terminator found in the tenant fixture.")
rehearsal_path.write_text(prefix + assertions + "\n" + fixture.rstrip() + "\nROLLBACK;\n", encoding="utf-8")

begin_match = re.search(r"(?im)^\s*BEGIN\s*;\s*$", sql)
if begin_match is None:
    raise SystemExit("The guarded negative copy could not locate the opening transaction.")
guard_sql = sql[: begin_match.end()] + "\nCREATE SCHEMA zaltyko;\n" + sql[begin_match.end() :]
guard_path.write_text(guard_sql, encoding="utf-8")
PY

cat >"$SETUP_SQL" <<'SQL'
BEGIN;
DO $rehearsal_preflight$
BEGIN
  IF current_database() <> 'zaltyko_canonical_rehearsal_ci'
     OR current_user <> 'postgres'
     OR current_setting('server_version_num')::integer NOT BETWEEN 170000 AND 179999 THEN
    RAISE EXCEPTION 'Unexpected rehearsal database, role, or PostgreSQL version';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_namespace
    WHERE nspname IN ('auth', 'extensions', 'zaltyko', 'zaltyko_domain_private', 'zaltyko_private')
  ) THEN
    RAISE EXCEPTION 'A rehearsal-owned namespace already exists';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role')) THEN
    RAISE EXCEPTION 'A rehearsal role already exists';
  END IF;
END
$rehearsal_preflight$;

CREATE ROLE anon NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
CREATE ROLE authenticated NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
CREATE ROLE service_role NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION BYPASSRLS;
COMMENT ON ROLE anon IS 'Synthetic anon principal for the disposable canonical-domain rehearsal only.';
COMMENT ON ROLE authenticated IS 'Synthetic authenticated principal for the disposable canonical-domain rehearsal only.';
COMMENT ON ROLE service_role IS 'Synthetic BYPASSRLS principal for the disposable canonical-domain rehearsal only; not a Supabase service role.';

CREATE SCHEMA extensions AUTHORIZATION postgres;
CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION btree_gist WITH SCHEMA extensions;
CREATE EXTENSION "uuid-ossp" WITH SCHEMA extensions;
GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role;
COMMENT ON SCHEMA extensions IS 'CI-only extension namespace for the disposable canonical-domain rehearsal.';

CREATE SCHEMA auth AUTHORIZATION postgres;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
COMMENT ON SCHEMA auth IS 'CI-only compatibility stand-ins; not a full Supabase Auth installation.';
COMMENT ON TABLE auth.users IS 'Synthetic UUID identity prerequisite only; no real auth users or credential columns.';
CREATE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE
AS $auth_uid$
  SELECT NULLIF(
    COALESCE(
      NULLIF(current_setting('request.jwt.claim.sub', true), ''),
      NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
    ),
    ''
  )::uuid
$auth_uid$;
CREATE FUNCTION auth.jwt() RETURNS jsonb
LANGUAGE sql STABLE
AS $auth_jwt$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$auth_jwt$;
COMMENT ON FUNCTION auth.uid() IS 'CI compatibility stand-in for Supabase auth.uid(); this is not the Supabase Auth service.';
COMMENT ON FUNCTION auth.jwt() IS 'CI compatibility stand-in for Supabase auth.jwt(); this is not the Supabase Auth service.';
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.jwt() TO anon, authenticated, service_role;

CREATE SCHEMA zaltyko_private AUTHORIZATION postgres;
GRANT USAGE ON SCHEMA zaltyko_private TO anon, authenticated, service_role;
COMMENT ON SCHEMA zaltyko_private IS 'Synthetic canary namespace; canonical rehearsal must leave it unchanged.';

CREATE TABLE public.canonical_domain_rehearsal_canary (
  id uuid PRIMARY KEY,
  marker text NOT NULL
);
INSERT INTO public.canonical_domain_rehearsal_canary (id, marker)
VALUES ('70000000-0000-4000-8000-000000000901', 'public-canary-fixed');
COMMENT ON TABLE public.canonical_domain_rehearsal_canary IS 'Synthetic public ACL/data canary for the disposable rehearsal.';
REVOKE ALL PRIVILEGES ON TABLE public.canonical_domain_rehearsal_canary FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.canonical_domain_rehearsal_canary TO authenticated;
CREATE FUNCTION public.canonical_domain_rehearsal_canary() RETURNS text
LANGUAGE sql IMMUTABLE
AS $public_canary$
  SELECT 'public-function-fixed'
$public_canary$;
COMMENT ON FUNCTION public.canonical_domain_rehearsal_canary() IS 'Synthetic public function ACL/comment canary.';
REVOKE ALL PRIVILEGES ON FUNCTION public.canonical_domain_rehearsal_canary() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.canonical_domain_rehearsal_canary() TO authenticated;

CREATE TABLE zaltyko_private.canonical_domain_rehearsal_canary (
  id uuid PRIMARY KEY,
  marker text NOT NULL
);
INSERT INTO zaltyko_private.canonical_domain_rehearsal_canary (id, marker)
VALUES ('70000000-0000-4000-8000-000000000902', 'private-canary-fixed');
COMMENT ON TABLE zaltyko_private.canonical_domain_rehearsal_canary IS 'Synthetic private ACL/data canary for the disposable rehearsal.';
REVOKE ALL PRIVILEGES ON TABLE zaltyko_private.canonical_domain_rehearsal_canary FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE zaltyko_private.canonical_domain_rehearsal_canary TO authenticated, service_role;
CREATE FUNCTION zaltyko_private.canonical_domain_rehearsal_canary() RETURNS text
LANGUAGE sql IMMUTABLE
AS $private_canary$
  SELECT 'private-function-fixed'
$private_canary$;
COMMENT ON FUNCTION zaltyko_private.canonical_domain_rehearsal_canary() IS 'Synthetic private function ACL/comment canary.';
REVOKE ALL PRIVILEGES ON FUNCTION zaltyko_private.canonical_domain_rehearsal_canary() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION zaltyko_private.canonical_domain_rehearsal_canary() TO authenticated;

COMMIT;
SQL

cat >"$ASSERT_SQL" <<'SQL'
DO $rehearsal_postcondition$
DECLARE
  v_bad integer;
BEGIN
  IF current_database() <> 'zaltyko_canonical_rehearsal_ci'
     OR current_user <> 'postgres'
     OR current_setting('server_version_num')::integer NOT BETWEEN 170000 AND 179999 THEN
    RAISE EXCEPTION 'Rehearsal connection changed database, role, or PostgreSQL major';
  END IF;
  IF to_regnamespace('zaltyko') IS NOT NULL
     OR to_regnamespace('zaltyko_domain_private') IS NOT NULL
     OR to_regclass('zaltyko_domain_private.e2e_schema_migrations') IS NOT NULL THEN
    RAISE EXCEPTION 'Canonical rehearsal objects survived ROLLBACK';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_default_acl) THEN
    RAISE EXCEPTION 'Canonical rehearsal default ACLs survived ROLLBACK or changed an external canary';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto')
     OR NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'btree_gist')
     OR NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'uuid-ossp') THEN
    RAISE EXCEPTION 'A required disposable extension prerequisite disappeared';
  END IF;
  IF (SELECT count(*) FROM auth.users) <> 0 THEN
    RAISE EXCEPTION 'Synthetic tenant identity rows survived ROLLBACK';
  END IF;
  IF auth.uid() IS NOT NULL OR auth.jwt() <> '{}'::jsonb THEN
    RAISE EXCEPTION 'Auth compatibility helpers have unexpected default claims';
  END IF;
  IF (SELECT count(*) FROM public.canonical_domain_rehearsal_canary
      WHERE id = '70000000-0000-4000-8000-000000000901' AND marker = 'public-canary-fixed') <> 1
     OR public.canonical_domain_rehearsal_canary() <> 'public-function-fixed'
     OR obj_description('public.canonical_domain_rehearsal_canary'::regclass, 'pg_class')
       <> 'Synthetic public ACL/data canary for the disposable rehearsal.'
     OR obj_description('public.canonical_domain_rehearsal_canary()'::regprocedure, 'pg_proc')
       <> 'Synthetic public function ACL/comment canary.'
     OR pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid = 'public.canonical_domain_rehearsal_canary'::regclass)) <> 'postgres'
     OR has_table_privilege('anon', 'public.canonical_domain_rehearsal_canary', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.canonical_domain_rehearsal_canary', 'SELECT')
     OR has_table_privilege('service_role', 'public.canonical_domain_rehearsal_canary', 'SELECT')
     OR has_function_privilege('anon', 'public.canonical_domain_rehearsal_canary()', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.canonical_domain_rehearsal_canary()', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.canonical_domain_rehearsal_canary()', 'EXECUTE') THEN
    RAISE EXCEPTION 'Public synthetic canary data, function, owner, comment, or ACL changed';
  END IF;
  IF (SELECT count(*) FROM zaltyko_private.canonical_domain_rehearsal_canary
      WHERE id = '70000000-0000-4000-8000-000000000902' AND marker = 'private-canary-fixed') <> 1
     OR zaltyko_private.canonical_domain_rehearsal_canary() <> 'private-function-fixed'
     OR obj_description('zaltyko_private.canonical_domain_rehearsal_canary'::regclass, 'pg_class')
       <> 'Synthetic private ACL/data canary for the disposable rehearsal.'
     OR obj_description('zaltyko_private.canonical_domain_rehearsal_canary()'::regprocedure, 'pg_proc')
       <> 'Synthetic private function ACL/comment canary.'
     OR pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid = 'zaltyko_private.canonical_domain_rehearsal_canary'::regclass)) <> 'postgres'
     OR has_table_privilege('anon', 'zaltyko_private.canonical_domain_rehearsal_canary', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'zaltyko_private.canonical_domain_rehearsal_canary', 'SELECT')
     OR NOT has_table_privilege('service_role', 'zaltyko_private.canonical_domain_rehearsal_canary', 'SELECT')
     OR has_function_privilege('anon', 'zaltyko_private.canonical_domain_rehearsal_canary()', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'zaltyko_private.canonical_domain_rehearsal_canary()', 'EXECUTE')
     OR has_function_privilege('service_role', 'zaltyko_private.canonical_domain_rehearsal_canary()', 'EXECUTE') THEN
    RAISE EXCEPTION 'Private synthetic canary data, function, owner, comment, or ACL changed';
  END IF;
  SELECT count(*) INTO v_bad
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'zaltyko_private'
    AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
    AND c.relname <> 'canonical_domain_rehearsal_canary';
  IF v_bad <> 0 THEN
    RAISE EXCEPTION 'Unexpected relation appeared in the synthetic private canary schema';
  END IF;
END
$rehearsal_postcondition$;
SQL

psql_base=(psql --no-psqlrc --no-password --quiet --set=ON_ERROR_STOP=1 --dbname "$CANONICAL_REHEARSAL_DATABASE_URL")
db_ready=false
for ((attempt = 1; attempt <= 30; attempt++)); do
  if "${psql_base[@]}" --command 'SELECT 1' >/dev/null 2>&1; then
    db_ready=true
    break
  fi
  sleep 1
done
[[ "$db_ready" == "true" ]] || fail "The exact disposable PostgreSQL service did not become ready."

if ! "${psql_base[@]}" --file "$SETUP_SQL" >"$SETUP_LOG" 2>&1; then
  fail_with_safe_log_lines "Synthetic role, Auth stand-in, extension, or canary preparation failed." "$SETUP_LOG"
fi

if ! "${psql_base[@]}" --file "$ASSERT_SQL" >"$VERIFY_LOG" 2>&1; then
  fail_with_safe_log_lines "Pre-rehearsal canary verification failed." "$VERIFY_LOG"
fi

# Only the generated rehearsal connection receives the session-local marker.
if ! env PGOPTIONS="-c app.canonical_domain_rehearsal=ci-explicit" "${psql_base[@]}" \
  --file "$REHEARSAL_SQL" >"$REHEARSAL_LOG" 2>&1; then
  fail_with_safe_log_lines "Canonical DDL, ACL, RLS, or tenant-isolation rehearsal failed." "$REHEARSAL_LOG"
fi

if ! "${psql_base[@]}" --file "$ASSERT_SQL" >"$VERIFY_LOG" 2>&1; then
  fail_with_safe_log_lines "Canonical schemas, canaries, or transactional rollback postconditions failed." "$VERIFY_LOG"
fi

# Guard probe: a CI-only copy inserts a synthetic namespace collision after
# BEGIN, before the generated precondition guard. That guard must refuse the
# pre-existing target schema. psql exits with ON_ERROR_STOP and disconnects;
# PostgreSQL rolls back the open transaction, which is then verified below.
if env PGOPTIONS="-c app.canonical_domain_rehearsal=ci-explicit" "${psql_base[@]}" \
  --file "$GUARD_SQL" >"$GUARD_LOG" 2>&1; then
  fail "The generated empty-schema guard unexpectedly accepted a pre-existing canonical namespace."
fi
if ! grep -Fq "canonical target schema already exists; refusing rehearsal" "$GUARD_LOG"; then
  fail "The existing-schema probe failed for a reason other than the exact canonical namespace guard."
fi

if ! "${psql_base[@]}" --file "$ASSERT_SQL" >"$VERIFY_LOG" 2>&1; then
  fail "The rejected namespace transaction changed canaries or left canonical objects behind."
fi

sql_sha256="$(sha256sum "$SQL_FILE" | awk '{print $1}')"
fixture_sha256="$(sha256sum "$TENANT_FIXTURE" | awk '{print $1}')"
printf 'PASS: guarded canonical SQL rehearsal on synthetic PostgreSQL 17; rollback, pre-DDL existing-schema refusal, 92 forced-RLS tables, 64 policies, 16 routines, ACL allow/deny, and canary preservation verified.\n'
printf 'PASS: synthetic tenant-row SELECT/denial fixture executed inside the rehearsal transaction.\n'
printf 'Evidence hashes: canonical SQL %s; tenant fixture %s.\n' "$sql_sha256" "$fixture_sha256"
printf 'Boundary: this is an isolated blank-database rehearsal, not migration history, production approval, or a full Supabase Auth environment.\n'
