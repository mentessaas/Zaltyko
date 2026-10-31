#!/usr/bin/env python3
"""Build a review-only canonical-schema SQL proposal from the pinned AST snapshot.

This program is intentionally CI-only. It never connects to a database, applies SQL,
or reads database credentials. Its output ends in ROLLBACK and is not an approved
production migration. The caller must run it in the repository's isolated GitHub
Actions job; it is not a local generator.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable


REPO_ROOT = Path(__file__).resolve().parents[2]
SNAPSHOT_REL = Path(
    "supabase/schema-snapshots/20261024172153_sandbox_schema_snapshot_baseline.sql"
)
MANIFEST_REL = Path("supabase/schema-snapshot-manifest.json")
EXPECTED_SNAPSHOT_SHA256 = "fd1bf2597b0dfd40dc6db824fa24773461f2776fa2ed7c994649be534c6a4b36"
EXPECTED_MANIFEST_SHA256 = "80c65acbb72345925b932fba2032259c6f7138a7c85da14c2babf6a23e34c6cc"
EXPECTED_PROJECT_REF = "aeeootdmuiqkfeernskw"
EXPECTED_MIGRATION_CANDIDATE_FILENAME = "20261025202902_canonical_domain_installation_candidate.sql"
TARGET_SCHEMAS = {"zaltyko", "zaltyko_domain_private"}
EXCLUDED_TABLES = {("zaltyko_domain_private", "e2e_schema_migrations")}
PGLAST_VERSION = "v7.21"
EXPECTED_PGLAST_PG_MAJOR = 17

# The only anonymous blocks in the approved snapshot are guards/ACL-normalizers/
# assertions. They are deliberately not copied to the proposal. Their exact source
# hash gate above prevents accepting a changed block under one of these labels.
KNOWN_DO_SENTINELS = {
    "baseline_empty_schema_guard": "app.schema_snapshot_replay",
    "baseline_default_acl_reset": "ALTER DEFAULT PRIVILEGES",
    "baseline_schema_acl_reset": "REVOKE ALL PRIVILEGES ON SCHEMA",
    "baseline_object_acl_reset": "REVOKE ALL PRIVILEGES ON ALL TABLES",
    "baseline_verify": "single source NOT VALID",
}


class ProposalError(RuntimeError):
    pass


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def require_ci_environment() -> None:
    if os.environ.get("GITHUB_ACTIONS") != "true" or os.environ.get("RUNNER_OS") != "Linux":
        raise ProposalError("CI-only guard: run from the isolated Linux GitHub Actions workflow")
    if not re.fullmatch(r"[0-9a-f]{40}", os.environ.get("GITHUB_SHA", "")):
        raise ProposalError("CI commit identity is missing or malformed")
    forbidden = (
        "DATABASE_URL",
        "SUPABASE_DB_URL",
        "SUPABASE_ACCESS_TOKEN",
        "SUPABASE_SERVICE_ROLE_KEY",
        "STRIPE_SECRET_KEY",
        "CANONICAL_REHEARSAL_DATABASE_URL",
    )
    present = [name for name in forbidden if os.environ.get(name)]
    if present:
        raise ProposalError("Refusing credential-bearing environment; remove: " + ", ".join(present))


def safe_output_path(raw: str) -> Path:
    path = (REPO_ROOT / raw).resolve()
    artifacts = (REPO_ROOT / "artifacts").resolve()
    if path == artifacts or artifacts not in path.parents:
        raise ProposalError("Outputs must be new files below repository artifacts/")
    if path.exists():
        raise ProposalError(f"Refusing to overwrite an existing artifact: {path.relative_to(REPO_ROOT)}")
    return path


def strings_from_name(nodes: Iterable[Any]) -> list[str]:
    values: list[str] = []
    for node in nodes or ():
        value = getattr(node, "sval", None)
        if value is None:
            raise ProposalError("Qualified-name AST contains a non-String component")
        values.append(value)
    return values


def ast_node_list(value: Any) -> tuple[Any, ...]:
    if value is None:
        return ()
    if isinstance(value, (tuple, list)):
        return tuple(value)
    return (value,)


def qname_parts(name_nodes: Iterable[Any]) -> tuple[str | None, str | None]:
    parts = strings_from_name(name_nodes)
    if not parts:
        return None, None
    if len(parts) == 1:
        return None, parts[0]
    return parts[-2], parts[-1]


def rangevar_parts(rangevar: Any) -> tuple[str | None, str | None]:
    if rangevar is None:
        return None, None
    return getattr(rangevar, "schemaname", None), getattr(rangevar, "relname", None)


def node_name(node: Any) -> str | None:
    """Return a PostgreSQL enum value's symbolic name when pglast exposes one."""
    return getattr(node, "name", None)


def object_name_parts(value: Any) -> tuple[str | None, str | None]:
    """Classify an AST object name without inspecting/decomposing SQL text."""
    if value is None:
        return None, None
    if type(value).__name__ == "RangeVar":
        return rangevar_parts(value)
    if type(value).__name__ == "ObjectWithArgs":
        return qname_parts(getattr(value, "objname", ()) or ())
    if type(value).__name__ == "TypeName":
        return qname_parts(getattr(value, "names", ()) or ())
    if isinstance(value, (tuple, list)):
        return qname_parts(value)
    return None, None


def owner_target(statement: Any) -> tuple[str | None, str | None]:
    relation = getattr(statement, "relation", None)
    if relation is not None:
        return rangevar_parts(relation)
    object_type = node_name(getattr(statement, "objectType", None))
    object_value = getattr(statement, "object", None)
    if object_type == "OBJECT_SCHEMA":
        names = strings_from_name(ast_node_list(object_value))
        return (names[-1], None) if names else (None, None)
    return object_name_parts(object_value)


def grant_target_objects(statement: Any) -> tuple[list[tuple[str | None, str | None]], bool]:
    """Return schema/name pairs addressed by an ACL AST, failing closed on unknown nodes."""
    target_type = node_name(getattr(statement, "targtype", None))
    object_type = node_name(getattr(statement, "objtype", None))
    objects = getattr(statement, "objects", ()) or ()
    if target_type == "ACL_TARGET_ALL_IN_SCHEMA":
        schemas = strings_from_name(objects)
        return [(schema, None) for schema in schemas], bool(schemas)
    if target_type != "ACL_TARGET_OBJECT" or not objects:
        return [], False

    targets: list[tuple[str | None, str | None]] = []
    for obj in objects:
        if object_type == "OBJECT_SCHEMA":
            names = strings_from_name((obj,))
            if len(names) != 1:
                return targets, False
            targets.append((names[0], None))
            continue
        schema, name = object_name_parts(obj)
        if schema is None:
            return targets, False
        targets.append((schema, name))
    return targets, True


def default_privilege_schemas(statement: Any) -> tuple[set[str], bool]:
    schemas: set[str] = set()
    found = False
    for option in getattr(statement, "options", ()) or ():
        if getattr(option, "defname", None) != "schemas":
            continue
        found = True
        values = getattr(option, "arg", None)
        try:
            schemas.update(strings_from_name(ast_node_list(values)))
        except ProposalError:
            return schemas, False
    return schemas, found and bool(schemas)


def sql_for(statement: Any, RawStream: Any) -> str:
    sql = RawStream(semicolon_after_last_statement=True)(statement).strip()
    return sql if sql.endswith(";") else sql + ";"


def quote_identifier(value: str) -> str:
    return '"' + value.replace('"', '""') + '"'


def quote_literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def owner_source_line(statement: Any, line: int) -> dict[str, Any]:
    schema, name = owner_target(statement)
    object_type = node_name(getattr(statement, "objectType", None))
    if schema is None:
        raise ProposalError(f"Cannot classify owner target {object_type} at source line {line}")
    return {"schema": schema, "name": name, "objectType": object_type, "sourceLine": line}


def role_name(role_spec: Any) -> str | None:
    value = getattr(role_spec, "rolename", None)
    if value:
        return value
    if node_name(getattr(role_spec, "roletype", None)) == "ROLESPEC_PUBLIC":
        return "PUBLIC"
    return None


def role_names_from_ast(value: Any) -> list[str]:
    names: list[str] = []
    for role in value or ():
        name = role_name(role)
        if name is None:
            raise ProposalError("ACL AST contains an unclassified role specification")
        names.append(name)
    return names


def scoped_acl_normalization_sql(
    *,
    default_acl_creators: tuple[str, ...] = ("postgres", "supabase_admin"),
    scope_label: str = "rehearsal",
) -> tuple[list[str], list[str]]:
    schema_array = "ARRAY[" + ", ".join("'" + schema + "'" for schema in sorted(TARGET_SCHEMAS)) + "]"
    creator_array = "ARRAY[" + ",".join(quote_literal(role) for role in default_acl_creators) + "]"
    default_acl_reset = [
        f"-- Newly authored ACL normalization, restricted to the two absent {scope_label} schemas.",
        "-- Does not copy or execute the snapshot's global/public/legacy DO blocks.",
        "DO $canonical_rehearsal_default_acl_reset$",
        "DECLARE v_creator text; v_schema text; v_role text; v_kind text;",
        "BEGIN",
        f"  FOREACH v_creator IN ARRAY {creator_array} LOOP",
        "    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_creator) THEN",
        f"      FOREACH v_schema IN ARRAY {schema_array} LOOP",
        "        FOREACH v_kind IN ARRAY ARRAY['TABLES','SEQUENCES','FUNCTIONS','TYPES'] LOOP",
        "          EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA %I REVOKE ALL ON %s FROM PUBLIC', v_creator, v_schema, v_kind);",
        "          FOR v_role IN SELECT rolname FROM pg_roles WHERE rolname <> v_creator ORDER BY rolname LOOP",
        "            EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA %I REVOKE ALL ON %s FROM %I', v_creator, v_schema, v_kind, v_role);",
        "          END LOOP;",
        "        END LOOP;",
        "      END LOOP;",
        "    END IF;",
        "  END LOOP;",
        "END",
        "$canonical_rehearsal_default_acl_reset$;",
    ]
    object_acl_reset = [
        "-- Object-level normalization is emitted after all selected DDL and ownership statements.",
        "DO $canonical_rehearsal_object_acl_reset$",
        "DECLARE v_schema text; v_role text; v_type text;",
        "BEGIN",
        f"  FOREACH v_schema IN ARRAY {schema_array} LOOP",
        "    EXECUTE format('REVOKE ALL PRIVILEGES ON SCHEMA %I FROM PUBLIC', v_schema);",
        "    EXECUTE format('REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA %I FROM PUBLIC', v_schema);",
        "    EXECUTE format('REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA %I FROM PUBLIC', v_schema);",
        "    EXECUTE format('REVOKE ALL PRIVILEGES ON ALL ROUTINES IN SCHEMA %I FROM PUBLIC', v_schema);",
        "    FOR v_role IN SELECT rolname FROM pg_roles WHERE rolname <> 'postgres' ORDER BY rolname LOOP",
        "      EXECUTE format('REVOKE ALL PRIVILEGES ON SCHEMA %I FROM %I', v_schema, v_role);",
        "      EXECUTE format('REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA %I FROM %I', v_schema, v_role);",
        "      EXECUTE format('REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA %I FROM %I', v_schema, v_role);",
        "      EXECUTE format('REVOKE ALL PRIVILEGES ON ALL ROUTINES IN SCHEMA %I FROM %I', v_schema, v_role);",
        "      FOR v_type IN SELECT t.typname FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = v_schema AND t.typtype = 'e' ORDER BY t.typname LOOP",
        "        EXECUTE format('REVOKE USAGE ON TYPE %I.%I FROM %I', v_schema, v_type, v_role);",
        "      END LOOP;",
        "    END LOOP;",
        "    FOR v_type IN SELECT t.typname FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = v_schema AND t.typtype = 'e' ORDER BY t.typname LOOP",
        "      EXECUTE format('REVOKE USAGE ON TYPE %I.%I FROM PUBLIC', v_schema, v_type);",
        "    END LOOP;",
        "  END LOOP;",
        "END",
        "$canonical_rehearsal_object_acl_reset$;",
    ]
    return default_acl_reset, object_acl_reset


def render_rehearsal_sql(
    *,
    ddl: list[str],
    schemas: set[str],
    owners: list[tuple[int, str]],
    grants: list[tuple[int, str]],
    defaults: list[tuple[int, str]],
    default_scopes: list[set[str]],
    roles: set[str],
) -> tuple[bytes, dict[str, Any]]:
    if schemas != TARGET_SCHEMAS:
        raise ProposalError(f"Rehearsal requires exactly the two source schemas; got {sorted(schemas)}")
    if len(defaults) != 2 or default_scopes != [{"zaltyko"}, {"zaltyko"}]:
        raise ProposalError("Expected the two pinned postgres default ACL grants in schema zaltyko")

    def dedupe(lines: list[tuple[int, str]]) -> list[tuple[list[int], str]]:
        by_sql: dict[str, list[int]] = {}
        for source_line, sql in lines:
            by_sql.setdefault(sql, []).append(source_line)
        return [(source_lines, sql) for sql, source_lines in by_sql.items()]

    unique_owners = dedupe(owners)
    unique_grants = dedupe(grants)
    unique_defaults = dedupe(defaults)
    default_reset_sql, object_reset_sql = scoped_acl_normalization_sql()
    required_roles = sorted(role for role in roles if role and role != "PUBLIC")
    role_literals = ", ".join(quote_literal(role) for role in required_roles)
    guard_sql = [
        "-- CI-ONLY CANONICAL DOMAIN REHEARSAL",
        "-- CI-only PostgreSQL 17.6 rehearsal. Never apply to a persistent/shared database.",
        "-- Required external environment: CANONICAL_DOMAIN_REHEARSAL_CI=1 and PGOPTIONS with app.canonical_domain_rehearsal=ci-explicit.",
        "-- The SQL verifies the session marker and disposable database identity before any schema mutation.",
        "BEGIN;",
        "SET LOCAL statement_timeout = '5s';",
        "SET LOCAL lock_timeout = '1s';",
        "DO $canonical_rehearsal_preconditions$",
        "DECLARE v_role text;",
        "BEGIN",
        "  IF current_database() IS DISTINCT FROM 'zaltyko_canonical_rehearsal_ci' THEN",
        "    RAISE EXCEPTION 'wrong database for canonical rehearsal';",
        "  END IF;",
        "  IF current_setting('app.canonical_domain_rehearsal', true) IS DISTINCT FROM 'ci-explicit' THEN",
        "    RAISE EXCEPTION 'missing external canonical rehearsal session marker';",
        "  END IF;",
        "  IF session_user <> 'postgres' AND NOT pg_has_role(session_user, 'postgres', 'MEMBER') THEN",
        "    RAISE EXCEPTION 'session user cannot assume the source owner role postgres';",
        "  END IF;",
        f"  FOREACH v_role IN ARRAY ARRAY[{role_literals}] LOOP",
        "    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN",
        "      RAISE EXCEPTION 'required source role % is absent', v_role;",
        "    END IF;",
        "  END LOOP;",
        "  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = ANY (ARRAY['zaltyko','zaltyko_domain_private'])) THEN",
        "    RAISE EXCEPTION 'canonical target schema already exists; refusing rehearsal';",
        "  END IF;",
        "END",
        "$canonical_rehearsal_preconditions$;",
        "SET LOCAL app.canonical_domain_rehearsal = 'ci-explicit';",
        "SET LOCAL ROLE postgres;",
        "-- CREATE SCHEMA has no IF NOT EXISTS: races or partial preexisting state fail closed.",
        *[f"CREATE SCHEMA {quote_identifier(schema)};" for schema in sorted(TARGET_SCHEMAS)],
        *default_reset_sql,
        "-- Canonical object definitions selected by the pinned AST classifier; no E2E ledger/public/legacy DDL.",
        *ddl,
        "-- Ownership statements are replayed only after all selected objects exist.",
        *[f"-- source lines {','.join(map(str, lines))}: owner AST\n{sql}" for lines, sql in unique_owners],
        *object_reset_sql,
        "-- Exact, AST-classified source GRANT/REVOKE statements, deduplicated by SQL AST serialization.",
        *[f"-- source lines {','.join(map(str, lines))}: explicit source ACL\n{sql}" for lines, sql in unique_grants],
        "-- Exact, target-scoped source default ACL grants, applied after normalization.",
        *[f"-- source lines {','.join(map(str, lines))}: explicit source default ACL\n{sql}" for lines, sql in unique_defaults],
        "ROLLBACK;",
        "",
    ]
    sql_text = "\n".join(guard_sql)
    details = {
        "purpose": "ephemeral-postgresql-rehearsal-only",
        "applyReady": False,
        "requiredDatabase": "zaltyko_canonical_rehearsal_ci",
        "requiredExternalSessionMarker": "app.canonical_domain_rehearsal=ci-explicit",
        "requiredRunnerEnvironmentMarker": "CANONICAL_DOMAIN_REHEARSAL_CI=1",
        "requiredSessionRole": "postgres (directly or assumable by session_user)",
        "requiredRoles": required_roles,
        "preconditions": [
            "Both target schemas must be absent at the beginning of the transaction.",
            "Source owner/grantee roles required by selected AST statements must already exist; no roles are created.",
            "PostgreSQL 17.6 disposable database only, matching pinned snapshot parser major.",
        ],
        "scope": {
            "includedSchemas": sorted(TARGET_SCHEMAS),
            "excludedSchemas": ["public", "zaltyko_private", "auth", "extensions", "vault"],
            "excludedObjects": sorted(f"{schema}.{name}" for schema, name in EXCLUDED_TABLES),
            "extensionInstallation": False,
        },
        "statements": {
            "schemaCreate": len(TARGET_SCHEMAS),
            "objectDdl": len(ddl),
            "ownerAstStatements": len(unique_owners),
            "sourceAclAstStatements": len(unique_grants),
            "sourceDefaultAclAstStatements": len(unique_defaults),
            "deduplicatedOwnerSourceLines": [lines for lines, _ in unique_owners if len(lines) > 1],
            "deduplicatedAclSourceLines": [lines for lines, _ in unique_grants if len(lines) > 1],
        },
        "normalization": {
            "authoredForRehearsal": True,
            "scope": sorted(TARGET_SCHEMAS),
            "defaultAclCreators": ["postgres", "supabase_admin when present"],
            "defaultAclKinds": ["TABLES", "SEQUENCES", "FUNCTIONS", "TYPES"],
            "objectAclKinds": ["SCHEMA", "TABLES", "SEQUENCES", "ROUTINES", "enum TYPE USAGE"],
            "effect": "Revokes ACL entries within the two newly-created schemas before reapplying explicit source grants; does not alter global defaults, PUBLIC, or legacy namespaces.",
            "implicitPublicExecute": "Revoked from all routines in target schemas, then only explicit source grants are restored.",
            "generatedCompositeTypeAcl": "Not explicitly normalized; source snapshot preserves platform defaults for generated row types.",
        },
        "mandatoryReview": [
            "All routine bodies and SECURITY DEFINER behavior remain unverified by the outer SQL AST.",
            "Source ACLs are reproduced as observed, including explicit PUBLIC grants; their security suitability is not endorsed.",
            "This transaction is rolled back and cannot be treated as an installation or migration mechanism.",
        ],
    }
    return sql_text.encode("utf-8"), details


def render_installation_review_sql(
    *,
    ddl: list[str],
    schemas: set[str],
    owners: list[tuple[int, str]],
    grants: list[tuple[int, str]],
    defaults: list[tuple[int, str]],
    default_scopes: list[set[str]],
    roles: set[str],
) -> tuple[bytes, dict[str, Any]]:
    if schemas != TARGET_SCHEMAS:
        raise ProposalError(f"Installation review requires exactly the two source schemas; got {sorted(schemas)}")
    if len(defaults) != 2 or default_scopes != [{"zaltyko"}, {"zaltyko"}]:
        raise ProposalError("Expected the two pinned postgres default ACL grants in schema zaltyko")

    def dedupe(lines: list[tuple[int, str]]) -> list[tuple[list[int], str]]:
        by_sql: dict[str, list[int]] = {}
        for source_line, sql in lines:
            by_sql.setdefault(sql, []).append(source_line)
        return [(source_lines, sql) for sql, source_lines in by_sql.items()]

    unique_owners = dedupe(owners)
    unique_grants = dedupe(grants)
    unique_defaults = dedupe(defaults)
    required_roles = sorted((roles | {"postgres", "anon", "authenticated", "service_role"}) - {"PUBLIC"})
    role_literals = ", ".join(quote_literal(role) for role in required_roles)
    default_reset_sql, object_reset_sql = scoped_acl_normalization_sql()
    sql_lines = [
        "-- EXACT INSTALLATION REVIEW CANDIDATE; NOT AN APPROVED OR EXECUTABLE MIGRATION.",
        "-- Expected target Supabase project ref (metadata only): jegxfahsvugilbthbked.",
        "-- The source snapshot came from a different sandbox; target compatibility is not implied.",
        "-- This file intentionally stops at REVIEW_ONLY_INSTALLATION_NOT_APPROVED before any DDL.",
        "BEGIN;",
        "SET LOCAL statement_timeout = '5s';",
        "SET LOCAL lock_timeout = '1s';",
        "DO $installation_review_hard_stop$",
        "BEGIN",
        "  RAISE EXCEPTION 'REVIEW_ONLY_INSTALLATION_NOT_APPROVED';",
        "END",
        "$installation_review_hard_stop$;",
        "-- All statements below are inert review material behind the unconditional exception above.",
        "-- A future migration requires a separately reviewed SQL file, its own CLI filename, and explicit authorization.",
        "DO $installation_review_preconditions$",
        "DECLARE v_role text;",
        "BEGIN",
        "  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = ANY (ARRAY['zaltyko','zaltyko_domain_private'])) THEN",
        "    RAISE EXCEPTION 'canonical target schemas must both be absent';",
        "  END IF;",
        f"  FOREACH v_role IN ARRAY ARRAY[{role_literals}] LOOP",
        "    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN",
        "      RAISE EXCEPTION 'required existing role % is absent; roles are never created here', v_role;",
        "    END IF;",
        "  END LOOP;",
        "END",
        "$installation_review_preconditions$;",
        "-- This prerequisite was separately confirmed available at version 1.7 but not installed in the target.",
        "CREATE EXTENSION btree_gist WITH SCHEMA extensions VERSION '1.7';",
        "-- The next two schemas must be absent; CREATE deliberately has no IF NOT EXISTS clause.",
        *[f"CREATE SCHEMA {quote_identifier(schema)};" for schema in sorted(TARGET_SCHEMAS)],
        *default_reset_sql,
        "-- AST-selected definitions for the two canonical schemas only; no role/auth/data/E2E/public/legacy creation.",
        *ddl,
        "-- Exact source owner statements, applied after the selected objects exist.",
        *[f"-- source lines {','.join(map(str, lines))}: owner AST\n{sql}" for lines, sql in unique_owners],
        *object_reset_sql,
        "-- Exact target-only ACL AST statements, deduplicated by deparsed SQL.",
        *[f"-- source lines {','.join(map(str, lines))}: explicit source ACL\n{sql}" for lines, sql in unique_grants],
        "-- Exact canonical-schema default ACL AST statements.",
        *[f"-- source lines {','.join(map(str, lines))}: explicit source default ACL\n{sql}" for lines, sql in unique_defaults],
        "ROLLBACK;",
        "",
    ]
    sql_bytes = "\n".join(sql_lines).encode("utf-8")
    details = {
        "applyReady": False,
        "purpose": "exact-installation-review-only-hard-stop",
        "expectedTargetProjectRef": "jegxfahsvugilbthbked",
        "expectedTargetProjectRefIsMetadataOnly": True,
        "sourceSnapshotProjectRef": EXPECTED_PROJECT_REF,
        "targetMatchOrApproval": False,
        "hardStop": {
            "unconditional": True,
            "exception": "REVIEW_ONLY_INSTALLATION_NOT_APPROVED",
            "position": "after BEGIN/local timeouts and before any DDL",
            "futureAuthorizationBoundary": "A future separately reviewed SQL migration needs its own CLI filename and explicit authorization.",
        },
        "preconditions": {
            "exactlyTwoCanonicalSchemasAbsent": True,
            "requiredRoles": required_roles,
            "rolesCreated": False,
            "authObjectsCreated": False,
            "supabasePlatformObjectsCreated": False,
            "applicationDataOrLedgerSeeded": False,
            "proposedExtensionInstallation": [
                {"name": "btree_gist", "schema": "extensions", "version": "1.7", "ifNotExists": False,
                 "ddlEmitted": True, "ddlExecutedByGenerator": False},
            ],
            "extensionAvailabilityReadOnlyConfirmed": True,
        },
        "readOnlyTargetCatalogFacts": {
            "provenance": "Coordinator-provided read-only catalog inspection dated 2026-10-25; not re-queried by this generator and not a persistent-state guarantee.",
            "authUsersPrimaryKeyColumns": ["id"],
            "authUidReturnType": "uuid",
            "authJwtReturnType": "jsonb",
            "extensionsSchemaPresent": True,
            "uuidSupport": {
                "pgcrypto": {"version": "1.3", "installed": True},
                "uuid-ossp": {"version": "1.1", "installed": True},
                "gen_random_uuidReturnType": "uuid",
            },
            "requiredRolesExist": ["postgres", "anon", "authenticated", "service_role"],
            "canonicalSchemasPresent": 0,
            "publicTableCount": 139,
            "legacySchemaPresent": True,
            "btreeGist": {"version": "1.7", "available": True, "installed": False},
            "relevantGlobalDefaultPrivileges": {"postgres": 0, "supabase_admin": 0},
        },
        "routineReview": {
            "bodiesStaticallyReviewed": True,
            "securityDefiners": 4,
            "reviewSource": "docs/qa/canonical-domain-routine-acl-review-2026-10-25.md",
            "limitations": "Static review and PG17 disposable rehearsal do not prove production compatibility or authorize apply.",
        },
        "postgresql17DisposableRehearsal": {
            "status": "SUCCESS",
            "runId": "40229946414",
            "doesNotApproveProductionApply": True,
        },
        "scope": {
            "includedSchemas": sorted(TARGET_SCHEMAS),
            "excludedSchemaObjectsOnly": ["public", "zaltyko_private", "auth", "extensions", "vault"],
            "extensionsException": "Only the explicit btree_gist 1.7 prerequisite statement targets the existing extensions schema; no other extensions-schema object is selected.",
            "excludedObjects": sorted(f"{schema}.{name}" for schema, name in EXCLUDED_TABLES),
            "dataStatements": 0,
            "ledgerStatements": 0,
            "roleCreationStatements": 0,
            "authObjectCreationStatements": 0,
        },
        "statementCounts": {
            "proposedExtensionPrerequisite": 1,
            "schemaCreate": len(TARGET_SCHEMAS),
            "objectDdl": len(ddl),
            "ownerAstStatements": len(unique_owners),
            "sourceAclAstStatements": len(unique_grants),
            "sourceDefaultAclAstStatements": len(unique_defaults),
        },
        "mandatoryReview": [
            "The SQL is deliberately blocked by an unconditional exception and always ends in ROLLBACK.",
            "The target-project ref is expected metadata only; the source snapshot belongs to another project.",
            "No live/project connection, migration ledger change, apply, promotion, or deployment is performed or authorized.",
        ],
    }
    return sql_bytes, details


def render_migration_candidate_sql(
    *,
    ddl: list[str],
    schemas: set[str],
    owners: list[tuple[int, str]],
    grants: list[tuple[int, str]],
    defaults: list[tuple[int, str]],
    default_scopes: list[set[str]],
    roles: set[str],
) -> tuple[bytes, dict[str, Any]]:
    if schemas != TARGET_SCHEMAS:
        raise ProposalError(f"Migration candidate requires exactly the two source schemas; got {sorted(schemas)}")
    if len(defaults) != 2 or default_scopes != [{"zaltyko"}, {"zaltyko"}]:
        raise ProposalError("Expected the two pinned postgres default ACL grants in schema zaltyko")

    def dedupe(lines: list[tuple[int, str]]) -> list[tuple[list[int], str]]:
        by_sql: dict[str, list[int]] = {}
        for source_line, sql in lines:
            by_sql.setdefault(sql, []).append(source_line)
        return [(source_lines, sql) for sql, source_lines in by_sql.items()]

    unique_owners = dedupe(owners)
    unique_grants = dedupe(grants)
    unique_defaults = dedupe(defaults)
    required_roles = sorted((roles | {"postgres", "anon", "authenticated", "service_role"}) - {"PUBLIC"})
    role_literals = ", ".join(quote_literal(role) for role in required_roles)
    default_reset_sql, object_reset_sql = scoped_acl_normalization_sql(
        default_acl_creators=("postgres",),
        scope_label="new canonical",
    )
    sql_lines = [
        "-- PROPOSED INSTALLATION CANDIDATE; applyReady=false; approvedForProduction=false.",
        f"-- CLI provenance filename: {EXPECTED_MIGRATION_CANDIDATE_FILENAME}.",
        f"-- Source snapshot SHA-256: {EXPECTED_SNAPSHOT_SHA256}.",
        "-- Source project is sandbox aeeootdmuiqkfeernskw; this is new DDL, not recovered migration history.",
        "-- Expected production project ref is an external attestation, not proof of connection identity.",
        "-- Production execution requires an independently authorized runner to verify the database URL/project.",
        "-- CI mode is restricted to the named disposable database; no mode marker authorizes production by itself.",
        "BEGIN;",
        "SET LOCAL statement_timeout = '5s';",
        "SET LOCAL lock_timeout = '1s';",
        "DO $canonical_installation_preconditions$",
        "DECLARE v_role text; v_mode text;",
        "BEGIN",
        "  v_mode := current_setting('app.canonical_installation_mode', true);",
        "  IF v_mode IS DISTINCT FROM 'ci' AND v_mode IS DISTINCT FROM 'production-reviewed-20261025202902' THEN",
        "    RAISE EXCEPTION 'canonical installation mode is not approved';",
        "  END IF;",
        "  IF v_mode = 'ci' AND current_database() IS DISTINCT FROM 'zaltyko_canonical_rehearsal_ci' THEN",
        "    RAISE EXCEPTION 'wrong database for canonical installation CI';",
        "  END IF;",
        "  IF v_mode = 'production-reviewed-20261025202902' AND current_setting('app.canonical_installation_target_project_ref', true) IS DISTINCT FROM 'jegxfahsvugilbthbked' THEN",
        "    RAISE EXCEPTION 'missing production target project attestation';",
        "  END IF;",
        "  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = ANY (ARRAY['zaltyko','zaltyko_domain_private'])) THEN",
        "    RAISE EXCEPTION 'canonical installation target schema already exists; refusing candidate';",
        "  END IF;",
        "  IF current_setting('server_version_num')::integer / 10000 <> 17 THEN",
        "    RAISE EXCEPTION 'PostgreSQL 17 is required for canonical installation candidate';",
        "  END IF;",
        f"  FOREACH v_role IN ARRAY ARRAY[{role_literals}] LOOP",
        "    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN",
        "      RAISE EXCEPTION 'required existing role % is absent; roles are never created here', v_role;",
        "    END IF;",
        "  END LOOP;",
        "  IF session_user <> 'postgres' AND NOT pg_has_role(session_user, 'postgres', 'MEMBER') THEN",
        "    RAISE EXCEPTION 'session user cannot assume the source owner role postgres';",
        "  END IF;",
        "  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'btree_gist') THEN",
        "    RAISE EXCEPTION 'btree_gist is already installed; refusing non-idempotent candidate';",
        "  END IF;",
        "  IF NOT EXISTS (SELECT 1 FROM pg_available_extension_versions WHERE name = 'btree_gist' AND version = '1.7') THEN",
        "    RAISE EXCEPTION 'btree_gist 1.7 is unavailable';",
        "  END IF;",
        "END",
        "$canonical_installation_preconditions$;",
        "SET LOCAL ROLE postgres;",
        "CREATE EXTENSION btree_gist WITH SCHEMA extensions VERSION '1.7';",
        "-- CREATE SCHEMA has no IF NOT EXISTS; races or existing state fail closed.",
        *[f"CREATE SCHEMA {quote_identifier(schema)};" for schema in sorted(TARGET_SCHEMAS)],
        *default_reset_sql,
        "-- AST-selected canonical DDL only; no E2E ledger, public, legacy, Auth, roles, or data.",
        *ddl,
        "-- Exact source owner statements, applied after the selected objects exist.",
        *[f"-- source lines {','.join(map(str, lines))}: owner AST\n{sql}" for lines, sql in unique_owners],
        *object_reset_sql,
        "-- Exact target-only ACL AST statements, deduplicated by deparsed SQL.",
        *[f"-- source lines {','.join(map(str, lines))}: explicit source ACL\n{sql}" for lines, sql in unique_grants],
        "-- Exact canonical-schema default ACL AST statements.",
        *[f"-- source lines {','.join(map(str, lines))}: explicit source default ACL\n{sql}" for lines, sql in unique_defaults],
        "COMMIT;",
        "",
    ]
    sql_bytes = "\n".join(sql_lines).encode("utf-8")
    details = {
        "applyReady": False,
        "approvedForProduction": False,
        "cliProvenanceFilename": EXPECTED_MIGRATION_CANDIDATE_FILENAME,
        "expectedTargetProjectRef": "jegxfahsvugilbthbked",
        "targetProjectRefIsExternalAttestationNotIdentityProof": True,
        "requiredExternalSessionMarkers": {
            "ci": "app.canonical_installation_mode=ci",
            "productionReviewed": "app.canonical_installation_mode=production-reviewed-20261025202902 and app.canonical_installation_target_project_ref=jegxfahsvugilbthbked",
        },
        "independentRunnerDatabaseUrlIdentityCheckRequiredForAnyProductionExecution": True,
        "preconditions": {
            "exactlyTwoCanonicalSchemasAbsent": True,
            "postgresqlMajor": 17,
            "rolesMustAlreadyExist": required_roles,
            "sessionMustBeAbleToAssumeRole": "postgres",
            "btreeGistMustBeAvailableButNotInstalled": {"version": "1.7", "schema": "extensions"},
            "noRolesAuthPlatformDataOrLedgerCreated": True,
        },
        "normalization": {
            "defaultAclCreators": ["postgres"],
            "scope": sorted(TARGET_SCHEMAS),
            "doesNotAlterSupabaseAdminDefaultsOrAnyGlobalDefaultAcl": True,
            "reason": "The installation candidate creates new objects as postgres; production catalog inspection found postgres cannot assume supabase_admin.",
        },
        "readOnlyTargetCatalogFacts": {
            "inspectedOn": "2026-10-25",
            "provenance": "Coordinator-provided production catalog inspection; not re-queried by the generator and not a persistent-state guarantee.",
            "supabaseAdminExists": True,
            "postgresCanAssumeSupabaseAdmin": False,
            "postgresIsSuperuser": False,
        },
        "testCiInstallationExactFilePlannedOnly": True,
        "aclSourceLines": [line for lines, _ in unique_grants for line in lines],
        "ownerSourceLines": [line for lines, _ in unique_owners for line in lines],
        "defaultAclSourceLines": [line for lines, _ in unique_defaults for line in lines],
        "statementCounts": {
            "extensionPrerequisite": 1,
            "schemaCreate": len(TARGET_SCHEMAS),
            "objectDdl": len(ddl),
            "ownerAstStatements": len(unique_owners),
            "sourceAclAstStatements": len(unique_grants),
            "sourceDefaultAclAstStatements": len(unique_defaults),
            "defaultAclResetCreators": ["postgres"],
        },
        "limitations": [
            "The production mode marker is not proof of database URL or project identity; any production execution needs an independently authorized runner-side target check.",
            "This generated candidate is not approved for production and does not itself authorize execution.",
            "The CI mode can only proceed when current_database() is zaltyko_canonical_rehearsal_ci; CI use is still limited to the disposable runner.",
        ],
    }
    return sql_bytes, details


def target_for(statement: Any) -> tuple[str | None, str | None]:
    kind = type(statement).__name__
    if kind in {"CreateStmt", "CreateSeqStmt", "IndexStmt", "AlterTableStmt"}:
        relation = getattr(statement, "relation", None)
        if relation is None and kind == "CreateSeqStmt":
            relation = getattr(statement, "sequence", None)
        return rangevar_parts(relation)
    if kind in {"CreateEnumStmt", "CreateDomainStmt", "CreateRangeStmt", "AlterDomainStmt", "AlterEnumStmt", "AlterTypeStmt"}:
        return qname_parts(getattr(statement, "typeName", ()) or getattr(statement, "domainname", ()))
    if kind in {"CreateFunctionStmt"}:
        return qname_parts(getattr(statement, "funcname", ()))
    if kind in {"CreatePolicyStmt", "AlterPolicyStmt"}:
        return rangevar_parts(getattr(statement, "table", None))
    if kind == "CreateTrigStmt":
        return rangevar_parts(getattr(statement, "relation", None))
    if kind == "CreateSchemaStmt":
        return getattr(statement, "schemaname", None), None
    if kind == "CompositeTypeStmt":
        return rangevar_parts(getattr(statement, "typevar", None))
    if kind == "ViewStmt":
        return rangevar_parts(getattr(statement, "view", None))
    return None, None


def serialized_nodes(value: Any) -> Iterable[dict[str, Any]]:
    """Walk pglast's documented recursive Node serialization, not SQL text."""
    if hasattr(value, "__call__") and type(value).__module__ == "pglast.ast":
        value = value()
    if isinstance(value, dict):
        if "@" in value:
            yield value
        for child in value.values():
            yield from serialized_nodes(child)
    elif isinstance(value, (tuple, list)):
        for child in value:
            yield from serialized_nodes(child)


def external_ast_references(statement: Any, source_line: int) -> list[dict[str, Any]]:
    refs: set[tuple[str, str]] = set()
    for node in serialized_nodes(statement):
        tag = node.get("@")
        if tag == "RangeVar" and node.get("schemaname"):
            schema, name, ref_kind = node["schemaname"], node.get("relname", ""), "relation"
        elif tag in {"TypeName", "FuncCall"}:
            key = "names" if tag == "TypeName" else "funcname"
            parts = [part.get("sval") for part in node.get(key, ()) if isinstance(part, dict)]
            if len(parts) < 2:
                continue
            schema, name = parts[-2], parts[-1]
            ref_kind = "type" if tag == "TypeName" else "function"
        else:
            continue
        if schema not in TARGET_SCHEMAS:
            refs.add((ref_kind, f"{schema}.{name}"))
    return [
        {"sourceLine": source_line, "kind": kind, "name": name}
        for kind, name in sorted(refs)
    ]


def do_sentinel(statement: Any) -> str | None:
    for arg in getattr(statement, "args", ()) or ():
        if getattr(arg, "defname", None) != "as":
            continue
        node = getattr(arg, "arg", None)
        body = getattr(node, "sval", "")
        matches = [name for name, sentinel in KNOWN_DO_SENTINELS.items() if sentinel in body]
        if len(matches) == 1:
            return matches[0]
    return None


def statement_source_line(source_bytes: bytes, offset: int) -> int:
    # libpg_query locations are UTF-8 byte offsets, not Python character offsets.
    return source_bytes[: max(0, offset)].count(b"\n") + 1


def is_owner_alter_table(statement: Any) -> bool:
    commands = getattr(statement, "cmds", ()) or ()
    if not commands:
        return False
    names = [getattr(getattr(command, "subtype", None), "name", "") for command in commands]
    return all(name == "AT_ChangeOwner" for name in names)


def routine_security_mode(statement: Any) -> str:
    modes: set[str] = set()
    found_security_option = False
    for option in getattr(statement, "options", ()) or ():
        if getattr(option, "defname", None) != "security":
            continue
        found_security_option = True
        argument = getattr(option, "arg", None)
        if type(argument).__name__ == "Boolean":
            value = getattr(argument, "boolval", None)
            if type(value) is bool:
                modes.add("definer" if value else "invoker")
                continue
        value = getattr(argument, "sval", None)
        if isinstance(value, str):
            modes.add(value.lower())
    if len(modes) == 1:
        return next(iter(modes))
    return "unclassified_security_option" if found_security_option else "default_invoker"


def object_records(statement: Any, schema: str, name: str, line: int) -> list[dict[str, Any]]:
    kind = type(statement).__name__
    if kind == "CreateSchemaStmt":
        return [{"schema": schema, "name": "", "kind": "schema", "sourceLine": line}]
    if kind == "CreateStmt":
        return [{"schema": schema, "name": name or "", "kind": "table", "sourceLine": line}]
    if kind == "CreateEnumStmt":
        return [{"schema": schema, "name": name or "", "kind": "enum_type", "sourceLine": line}]
    if kind == "CreateFunctionStmt":
        return [{
            "schema": schema,
            "name": name or "",
            "kind": "routine",
            "sourceLine": line,
            "bodyReviewRequired": True,
            "securityDefinerReviewRequired": True,
            "securityMode": routine_security_mode(statement),
            "securityDefiner": (
                True if routine_security_mode(statement) == "definer"
                else False if routine_security_mode(statement) in {"invoker", "default_invoker"}
                else None
            ),
        }]
    if kind == "IndexStmt":
        return [{"schema": schema, "name": getattr(statement, "idxname", "") or "", "kind": "index", "sourceLine": line}]
    if kind == "CreatePolicyStmt":
        return [{"schema": schema, "name": getattr(statement, "policy_name", "") or "", "kind": "policy", "sourceLine": line}]
    if kind == "CreateTrigStmt":
        return [{"schema": schema, "name": getattr(statement, "trigname", "") or "", "kind": "trigger", "sourceLine": line}]
    if kind == "AlterTableStmt":
        records: list[dict[str, Any]] = []
        for command in getattr(statement, "cmds", ()) or ():
            subtype = getattr(getattr(command, "subtype", None), "name", "")
            definition = getattr(command, "def_", None)
            if subtype == "AT_AddConstraint" and definition is not None:
                records.append({
                    "schema": schema,
                    "name": getattr(definition, "conname", "") or "",
                    "kind": "constraint",
                    "sourceLine": line,
                })
            else:
                records.append({"schema": schema, "name": name or "", "kind": "table_alter", "sourceLine": line})
        return records
    if kind in {"CreateDomainStmt", "CreateRangeStmt", "CompositeTypeStmt", "CreateSeqStmt", "ViewStmt"}:
        return [{"schema": schema, "name": name or "", "kind": kind, "sourceLine": line}]
    raise ProposalError(f"No inventory serializer for included AST type {kind} at source line {line}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--snapshot", required=True)
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--manifest-output", required=True)
    parser.add_argument("--rehearsal-output")
    parser.add_argument("--installation-review-output")
    parser.add_argument("--migration-candidate-output")
    return parser.parse_args()


def main() -> int:
    require_ci_environment()
    args = parse_args()
    snapshot_path = (REPO_ROOT / args.snapshot).resolve()
    manifest_path = (REPO_ROOT / args.manifest).resolve()
    if snapshot_path != REPO_ROOT / SNAPSHOT_REL or manifest_path != REPO_ROOT / MANIFEST_REL:
        raise ProposalError("Only the pinned approved snapshot and manifest are accepted")
    output_path = safe_output_path(args.output)
    manifest_output_path = safe_output_path(args.manifest_output)
    rehearsal_path = safe_output_path(args.rehearsal_output) if args.rehearsal_output else None
    installation_path = safe_output_path(args.installation_review_output) if args.installation_review_output else None
    migration_candidate_path = safe_output_path(args.migration_candidate_output) if args.migration_candidate_output else None
    if migration_candidate_path is not None and migration_candidate_path.relative_to(REPO_ROOT) != Path("artifacts") / EXPECTED_MIGRATION_CANDIDATE_FILENAME:
        raise ProposalError(f"Migration candidate output must be artifacts/{EXPECTED_MIGRATION_CANDIDATE_FILENAME}")
    artifact_paths = [output_path, manifest_output_path]
    artifact_paths.extend(path for path in (rehearsal_path, installation_path, migration_candidate_path) if path is not None)
    if len(set(artifact_paths)) != len(artifact_paths):
        raise ProposalError("SQL and JSON outputs must be different files")
    scoped_review_requested = (
        rehearsal_path is not None or installation_path is not None or migration_candidate_path is not None
    )

    snapshot_bytes = snapshot_path.read_bytes()
    manifest_bytes = manifest_path.read_bytes()
    snapshot_sha = sha256_bytes(snapshot_bytes)
    manifest_sha = sha256_bytes(manifest_bytes)
    if snapshot_sha != EXPECTED_SNAPSHOT_SHA256 or manifest_sha != EXPECTED_MANIFEST_SHA256:
        raise ProposalError("Pinned snapshot or provenance manifest hash changed; manual review required")
    manifest = json.loads(manifest_bytes)
    source = manifest.get("source", {})
    baseline = manifest.get("baseline", {})
    if source.get("project_ref") != EXPECTED_PROJECT_REF:
        raise ProposalError("Snapshot project ref does not match the approved sandbox")
    if source.get("database_version") != "PostgreSQL 17.6":
        raise ProposalError("Snapshot PostgreSQL version changed; manual parser compatibility review required")
    if manifest.get("historical_migration_history_recovered") is not False:
        raise ProposalError("Expected current-state snapshot with unrecovered migration history")
    if source.get("application_rows_read") is not False or source.get("secrets_read_or_included") is not False:
        raise ProposalError("Snapshot provenance does not satisfy the no-data/no-secret contract")
    if baseline.get("sha256") != EXPECTED_SNAPSHOT_SHA256 or baseline.get("path") != str(SNAPSHOT_REL):
        raise ProposalError("Manifest does not identify the pinned snapshot hash/path")

    try:
        import pglast
        from pglast import parse_sql
        from pglast.parser import get_postgresql_version
        from pglast.stream import RawStream
    except ImportError as exc:
        raise ProposalError("Pinned pglast==7.21 must be installed by the isolated CI job") from exc
    parser_pg = get_postgresql_version()
    if pglast.__version__ != PGLAST_VERSION or parser_pg[0] != EXPECTED_PGLAST_PG_MAJOR:
        raise ProposalError(
            f"Parser mismatch: require pglast {PGLAST_VERSION} targeting PG17; got {pglast.__version__} / {parser_pg}"
        )

    source_text = snapshot_bytes.decode("utf-8")
    parsed = parse_sql(source_text)
    included_sql: list[str] = []
    rehearsal_ddl: list[str] = []
    rehearsal_owner_sql: list[tuple[int, str]] = []
    rehearsal_grant_sql: list[tuple[int, str]] = []
    rehearsal_default_acl_sql: list[tuple[int, str]] = []
    rehearsal_acl_records: list[dict[str, Any]] = []
    rehearsal_owner_records: list[dict[str, Any]] = []
    rehearsal_default_acl_records: list[dict[str, Any]] = []
    rehearsal_roles: set[str] = {"postgres", "anon", "authenticated", "service_role"}
    rehearsal_schema_names: set[str] = set()
    included_objects: list[dict[str, Any]] = []
    omitted = Counter()
    omitted_e2e: list[dict[str, Any]] = []
    extension_prerequisites: dict[str, dict[str, str | None]] = {}
    external_references: set[tuple[int, str, str]] = set()
    statement_counts = Counter()
    security_definer_candidates: list[dict[str, Any]] = []

    known_non_object = {
        "VariableSetStmt": "pg_dump_session_setting",
    }
    supported_scoped = {
        "CreateSchemaStmt",
        "CreateStmt",
        "CreateEnumStmt",
        "CreateFunctionStmt",
        "CreateSeqStmt",
        "IndexStmt",
        "AlterTableStmt",
        "CreatePolicyStmt",
        "AlterPolicyStmt",
        "CreateTrigStmt",
        "CreateDomainStmt",
        "CreateRangeStmt",
        "CompositeTypeStmt",
        "ViewStmt",
        "AlterDomainStmt",
        "AlterEnumStmt",
        "AlterTypeStmt",
    }

    for raw_stmt in parsed:
        statement = raw_stmt.stmt
        kind = type(statement).__name__
        line = statement_source_line(snapshot_bytes, raw_stmt.stmt_location)
        statement_counts[kind] += 1

        if kind == "DoStmt":
            sentinel = do_sentinel(statement)
            if sentinel is None:
                raise ProposalError(f"Unknown procedural block at source line {line}; refusing to omit it")
            omitted[f"known_guard_or_acl_block:{sentinel}"] += 1
            continue
        if kind == "CreateExtensionStmt":
            extname = getattr(statement, "extname", "")
            options = {getattr(option, "defname", ""): getattr(getattr(option, "arg", None), "sval", None)
                       for option in (getattr(statement, "options", ()) or ())}
            extension_prerequisites[extname] = {
                "schema": options.get("schema"),
                "version": options.get("new_version"),
            }
            omitted["extension_prerequisite_not_emitted"] += 1
            continue
        if kind == "AlterOwnerStmt":
            if not scoped_review_requested:
                omitted["ownership_requires_manual_review"] += 1
                continue
            record = owner_source_line(statement, line)
            if record["schema"] in TARGET_SCHEMAS and (record["schema"], record["name"] or "") not in EXCLUDED_TABLES:
                sql = sql_for(statement, RawStream)
                rehearsal_owner_sql.append((line, sql))
                rehearsal_owner_records.append(record)
                owner = role_name(getattr(statement, "newowner", None))
                if not owner:
                    raise ProposalError(f"Cannot classify owner role at source line {line}")
                rehearsal_roles.add(owner)
                omitted["ownership_requires_manual_review"] += 1
            else:
                omitted["ownership_requires_manual_review"] += 1
            continue
        if kind == "AlterDefaultPrivilegesStmt":
            if not scoped_review_requested:
                omitted["default_acl_requires_manual_review"] += 1
                continue
            schemas, classified = default_privilege_schemas(statement)
            if not classified:
                raise ProposalError(f"Cannot classify default ACL scope at source line {line}")
            if schemas.intersection(TARGET_SCHEMAS) and not schemas.issubset(TARGET_SCHEMAS):
                raise ProposalError(f"Mixed-scope default ACL at source line {line}; refusing partial replay")
            if schemas.issubset(TARGET_SCHEMAS):
                sql = sql_for(statement, RawStream)
                rehearsal_default_acl_sql.append((line, sql))
                action = getattr(statement, "action", None)
                rehearsal_default_acl_records.append({"sourceLine": line, "schemas": sorted(schemas), "sql": sql})
                for option in getattr(statement, "options", ()) or ():
                    if getattr(option, "defname", None) == "roles":
                        rehearsal_roles.update(role_names_from_ast(ast_node_list(getattr(option, "arg", None))))
                rehearsal_roles.update(
                    name for name in role_names_from_ast(getattr(action, "grantees", ()) or ())
                    if name != "PUBLIC"
                )
                omitted["default_acl_requires_manual_review"] += 1
            else:
                omitted["default_acl_requires_manual_review"] += 1
            continue
        if kind == "GrantStmt":
            if not scoped_review_requested:
                omitted["acl_requires_manual_review"] += 1
                continue
            targets, classified = grant_target_objects(statement)
            if not classified:
                raise ProposalError(f"Cannot classify ACL targets at source line {line}")
            scopes = {schema for schema, _ in targets}
            target_scopes = scopes.intersection(TARGET_SCHEMAS)
            if target_scopes and scopes - TARGET_SCHEMAS:
                raise ProposalError(f"Mixed-scope ACL at source line {line}; refusing partial replay")
            target_e2e = [target for target in targets if (target[0], target[1] or "") in EXCLUDED_TABLES]
            if target_e2e:
                if len(target_e2e) != len(targets):
                    raise ProposalError(f"ACL combines E2E and canonical objects at source line {line}")
                omitted["acl_requires_manual_review"] += 1
                continue
            if target_scopes:
                sql = sql_for(statement, RawStream)
                rehearsal_grant_sql.append((line, sql))
                grantees = [role_name(value) for value in getattr(statement, "grantees", ()) or ()]
                rehearsal_acl_records.append({"sourceLine": line, "targetObjects": targets, "grantees": grantees, "sql": sql})
                rehearsal_roles.update(name for name in grantees if name and name != "PUBLIC")
                omitted["acl_requires_manual_review"] += 1
            else:
                omitted["acl_requires_manual_review"] += 1
            continue
        if kind in known_non_object:
            omitted[known_non_object[kind]] += 1
            continue
        if kind not in supported_scoped:
            raise ProposalError(f"Unclassified AST statement {kind} at source line {line}; refusing partial proposal")

        schema, name = target_for(statement)
        if kind == "AlterTableStmt" and is_owner_alter_table(statement):
            if not scoped_review_requested:
                omitted["table_ownership_requires_manual_review"] += 1
                continue
            record = {"schema": schema, "name": name, "objectType": "OBJECT_TABLE", "sourceLine": line}
            if schema in TARGET_SCHEMAS and (schema, name or "") not in EXCLUDED_TABLES:
                sql = sql_for(statement, RawStream)
                rehearsal_owner_sql.append((line, sql))
                rehearsal_owner_records.append(record)
                omitted["table_ownership_requires_manual_review"] += 1
            else:
                omitted["table_ownership_requires_manual_review"] += 1
            continue
        if schema not in TARGET_SCHEMAS:
            omitted[f"out_of_scope:{kind}"] += 1
            continue
        if (schema, name or "") in EXCLUDED_TABLES:
            omitted_e2e.append({"schema": schema, "name": name, "sourceLine": line, "kind": kind})
            omitted["e2e_ledger_excluded"] += 1
            continue

        # RawStream retains its output buffer; use one instance per statement.
        sql = sql_for(statement, RawStream)
        reparsed = parse_sql(sql)
        if len(reparsed) != 1 or reparsed[0].stmt != statement:
            raise ProposalError(f"AST round-trip mismatch for {kind} at source line {line}")
        included_sql.append(f"-- snapshot source line {line}: {kind}\n{sql}")
        if kind == "CreateSchemaStmt":
            rehearsal_schema_names.add(schema or "")
        else:
            rehearsal_ddl.append(f"-- snapshot source line {line}: {kind}\n{sql}")
        included_objects.extend(object_records(statement, schema or "", name or "", line))
        for reference in external_ast_references(statement, line):
            external_references.add((reference["sourceLine"], reference["kind"], reference["name"]))
        if kind == "CreateFunctionStmt":
            mode = routine_security_mode(statement)
            security_definer_candidates.append({
                "schema": schema,
                "name": name,
                "sourceLine": line,
                "securityMode": mode,
                "securityDefiner": (
                    True if mode == "definer"
                    else False if mode in {"invoker", "default_invoker"}
                    else None
                ),
            })

    if not included_sql:
        raise ProposalError("AST selection produced an empty proposal")
    expected_counts = {
        "schema": 2, "table": 92, "enum_type": 61, "routine": 16,
        "constraint": 851, "index": 107, "policy": 64, "trigger": 17,
    }
    actual_counts = Counter(entry["kind"] for entry in included_objects)
    for object_kind, expected_count in expected_counts.items():
        if actual_counts[object_kind] != expected_count:
            raise ProposalError(f"Pinned inventory mismatch for {object_kind}: expected {expected_count}, got {actual_counts[object_kind]}")
    if sum(entry["securityDefiner"] is True for entry in security_definer_candidates) != 4:
        raise ProposalError("Pinned routine inventory must identify four SECURITY DEFINER routines")
    if sum(1 for entry in omitted_e2e if entry["schema"] == "zaltyko_domain_private") < 3:
        raise ProposalError("Expected E2E ledger and its attached DDL to be excluded; review classifier")
    if not extension_prerequisites:
        raise ProposalError("No external extension prerequisites were identified")

    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    proposal_sql = "\n".join([
        "-- REVIEW-ONLY SQL PROPOSAL. NOT AN APPROVED MIGRATION OR APPLY INSTRUCTION.",
        f"-- Source snapshot SHA-256: {snapshot_sha}",
        "-- Scope: new-object definitions for zaltyko and zaltyko_domain_private only.",
        "-- Excludes public, zaltyko_private, all E2E ledger objects, ACLs, owners, default ACLs, extensions, and DO blocks.",
        "-- Do not remove the final ROLLBACK. Any future apply requires a separately reviewed diff and authorization.",
        "BEGIN;",
        "SET LOCAL statement_timeout = '5s';",
        "SET LOCAL lock_timeout = '1s';",
        *included_sql,
        "ROLLBACK;",
        "",
    ])
    proposal_bytes = proposal_sql.encode("utf-8")

    rehearsal_bytes: bytes | None = None
    rehearsal_details: dict[str, Any] | None = None
    if rehearsal_path is not None:
        rehearsal_bytes, rehearsal_details = render_rehearsal_sql(
            ddl=rehearsal_ddl,
            schemas=rehearsal_schema_names,
            owners=rehearsal_owner_sql,
            grants=rehearsal_grant_sql,
            defaults=rehearsal_default_acl_sql,
            default_scopes=[set(record["schemas"]) for record in rehearsal_default_acl_records],
            roles=rehearsal_roles,
        )
        rehearsal_roundtrip = parse_sql(rehearsal_bytes.decode("utf-8"))
        if not rehearsal_roundtrip or type(rehearsal_roundtrip[-1].stmt).__name__ != "TransactionStmt":
            raise ProposalError("Rehearsal SQL does not end in a parsed transaction statement")
        if node_name(getattr(rehearsal_roundtrip[-1].stmt, "kind", None)) != "TRANS_STMT_ROLLBACK":
            raise ProposalError("Rehearsal SQL must end in ROLLBACK")

    installation_bytes: bytes | None = None
    installation_details: dict[str, Any] | None = None
    if installation_path is not None:
        installation_bytes, installation_details = render_installation_review_sql(
            ddl=rehearsal_ddl,
            schemas=rehearsal_schema_names,
            owners=rehearsal_owner_sql,
            grants=rehearsal_grant_sql,
            defaults=rehearsal_default_acl_sql,
            default_scopes=[set(record["schemas"]) for record in rehearsal_default_acl_records],
            roles=rehearsal_roles,
        )
        installation_roundtrip = parse_sql(installation_bytes.decode("utf-8"))
        if len(installation_roundtrip) < 6 or type(installation_roundtrip[3].stmt).__name__ != "DoStmt":
            raise ProposalError("Installation review hard-stop must parse before any DDL")
        extension_stmt = installation_roundtrip[5].stmt
        extension_options = {
            getattr(option, "defname", ""): getattr(getattr(option, "arg", None), "sval", None)
            for option in (getattr(extension_stmt, "options", ()) or ())
        }
        if (
            type(extension_stmt).__name__ != "CreateExtensionStmt"
            or getattr(extension_stmt, "extname", None) != "btree_gist"
            or extension_options.get("schema") != "extensions"
            or extension_options.get("new_version") != "1.7"
            or any(getattr(option, "defname", None) == "if_not_exists"
                   for option in (getattr(extension_stmt, "options", ()) or ()))
        ):
            raise ProposalError("Installation review must parse the exact btree_gist 1.7 prerequisite without IF NOT EXISTS")
        if type(installation_roundtrip[-1].stmt).__name__ != "TransactionStmt":
            raise ProposalError("Installation review SQL does not end in a parsed transaction statement")
        if node_name(getattr(installation_roundtrip[-1].stmt, "kind", None)) != "TRANS_STMT_ROLLBACK":
            raise ProposalError("Installation review SQL must end in ROLLBACK")

    migration_candidate_bytes: bytes | None = None
    migration_candidate_details: dict[str, Any] | None = None
    if migration_candidate_path is not None:
        migration_candidate_bytes, migration_candidate_details = render_migration_candidate_sql(
            ddl=rehearsal_ddl,
            schemas=rehearsal_schema_names,
            owners=rehearsal_owner_sql,
            grants=rehearsal_grant_sql,
            defaults=rehearsal_default_acl_sql,
            default_scopes=[set(record["schemas"]) for record in rehearsal_default_acl_records],
            roles=rehearsal_roles,
        )
        candidate_roundtrip = parse_sql(migration_candidate_bytes.decode("utf-8"))
        if len(candidate_roundtrip) < 8 or type(candidate_roundtrip[3].stmt).__name__ != "DoStmt":
            raise ProposalError("Migration candidate preconditions must parse before any DDL")
        candidate_extension_stmt = candidate_roundtrip[5].stmt
        candidate_extension_options = {
            getattr(option, "defname", ""): getattr(getattr(option, "arg", None), "sval", None)
            for option in (getattr(candidate_extension_stmt, "options", ()) or ())
        }
        if (
            type(candidate_extension_stmt).__name__ != "CreateExtensionStmt"
            or getattr(candidate_extension_stmt, "extname", None) != "btree_gist"
            or candidate_extension_options.get("schema") != "extensions"
            or candidate_extension_options.get("new_version") != "1.7"
            or any(getattr(option, "defname", None) == "if_not_exists"
                   for option in (getattr(candidate_extension_stmt, "options", ()) or ()))
        ):
            raise ProposalError("Migration candidate must parse the exact btree_gist 1.7 prerequisite without IF NOT EXISTS")
        if type(candidate_roundtrip[-1].stmt).__name__ != "TransactionStmt":
            raise ProposalError("Migration candidate does not end in a parsed transaction statement")
        if node_name(getattr(candidate_roundtrip[-1].stmt, "kind", None)) != "TRANS_STMT_COMMIT":
            raise ProposalError("Migration candidate must end in COMMIT")

    output_manifest = {
        "artifactKind": "review-only-canonical-schema-sql-proposal",
        "applyReady": False,
        "generatedAtUtc": now,
        "candidateCommit": os.environ["GITHUB_SHA"],
        "generator": {
            "path": str(Path(__file__).resolve().relative_to(REPO_ROOT)),
            "sha256": sha256_bytes(Path(__file__).read_bytes()),
            "pglast": pglast.__version__,
            "parserPostgreSQLVersion": list(parser_pg),
        },
        "source": {
            "snapshot": str(SNAPSHOT_REL),
            "snapshotSha256": snapshot_sha,
            "manifest": str(MANIFEST_REL),
            "manifestSha256": manifest_sha,
            "projectRef": EXPECTED_PROJECT_REF,
            "snapshotDatabaseVersion": source["database_version"],
            "historicalMigrationHistoryRecovered": False,
            "applicationRowsRead": False,
            "secretsReadOrIncluded": False,
        },
        "sqlProposal": {
            "path": str(output_path.relative_to(REPO_ROOT)),
            "sha256": sha256_bytes(proposal_bytes),
            "sizeBytes": len(proposal_bytes),
            "includedStatements": len(included_sql),
        },
        "scope": {
            "includedSchemas": sorted(TARGET_SCHEMAS),
            "excludedSchemas": ["public", "zaltyko_private", "auth", "extensions", "vault"],
            "excludedObjects": omitted_e2e,
            "excludedCountsByReason": dict(sorted(omitted.items())),
            "sourceStatementCountsByAstType": dict(sorted(statement_counts.items())),
        },
        "objects": included_objects,
        "externalDependencies": [
            {"sourceLine": line, "kind": kind, "qualifiedName": name}
            for line, kind, name in sorted(external_references)
        ],
        "extensionPrerequisitesNotEmitted": [
            {"name": name, **details}
            for name, details in sorted(extension_prerequisites.items())
        ],
        "routineReview": {
            "allRoutineBodiesRequireManualReview": True,
            "routinesRequiringManualSecurityReview": security_definer_candidates,
            "bodyDependencyAnalysis": "Not performed; pglast SQL AST does not analyze PL/pgSQL/SQL routine-body effects or dynamic SQL.",
        },
        "blockingLimitations": [
            "Dependency inventory is partial: unqualified names and routine-body SQL/PLpgSQL effects are not resolved by the outer AST classifier.",
            "ACL, ownership, default privileges, RLS grant context, and policy effectiveness are not approved by this proposal; ACL/owner/default-ACL source statements were omitted.",
            "New PostgreSQL functions receive default PUBLIC EXECUTE unless separately revoked/granted; this artifact intentionally does not resolve that security requirement.",
            "The snapshot's external public/auth/extensions dependencies must be compared object-by-object with the target catalog before a new DDL diff can be reviewed.",
            "No production target was queried; no SQL was applied; AST parse and round-trip do not validate PostgreSQL execution, dependency availability, permissions, or application behavior.",
            "The transaction ends with ROLLBACK for review safety, but this file is still a proposal artifact and must not be used as an apply mechanism.",
        ],
    }

    if rehearsal_path is not None and rehearsal_bytes is not None and rehearsal_details is not None:
        output_manifest["sqlRehearsal"] = {
            "path": str(rehearsal_path.relative_to(REPO_ROOT)),
            "sha256": sha256_bytes(rehearsal_bytes),
            "sizeBytes": len(rehearsal_bytes),
            "includedStatements": sum(
                value for value in rehearsal_details["statements"].values()
                if isinstance(value, int)
            ),
            **rehearsal_details,
            "ownerAstSources": rehearsal_owner_records,
            "explicitAclAstSources": rehearsal_acl_records,
            "explicitDefaultAclAstSources": rehearsal_default_acl_records,
            "explicitPublicGrants": [
                record for record in rehearsal_acl_records if "PUBLIC" in record["grantees"]
            ],
        }

    if installation_path is not None and installation_bytes is not None and installation_details is not None:
        output_manifest["installationReview"] = {
            "path": str(installation_path.relative_to(REPO_ROOT)),
            "sha256": sha256_bytes(installation_bytes),
            "sizeBytes": len(installation_bytes),
            **installation_details,
            "ownerAstSources": rehearsal_owner_records,
            "explicitAclAstSources": rehearsal_acl_records,
            "explicitDefaultAclAstSources": rehearsal_default_acl_records,
        }

    if migration_candidate_path is not None and migration_candidate_bytes is not None and migration_candidate_details is not None:
        output_manifest["migrationCandidate"] = {
            "path": str(migration_candidate_path.relative_to(REPO_ROOT)),
            "sha256": sha256_bytes(migration_candidate_bytes),
            "sizeBytes": len(migration_candidate_bytes),
            **migration_candidate_details,
            "ownerAstSources": rehearsal_owner_records,
            "explicitAclAstSources": rehearsal_acl_records,
            "explicitDefaultAclAstSources": rehearsal_default_acl_records,
        }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_bytes(proposal_bytes)
    if rehearsal_path is not None and rehearsal_bytes is not None:
        rehearsal_path.parent.mkdir(parents=True, exist_ok=True)
        rehearsal_path.write_bytes(rehearsal_bytes)
    if installation_path is not None and installation_bytes is not None:
        installation_path.parent.mkdir(parents=True, exist_ok=True)
        installation_path.write_bytes(installation_bytes)
    if migration_candidate_path is not None and migration_candidate_bytes is not None:
        migration_candidate_path.parent.mkdir(parents=True, exist_ok=True)
        migration_candidate_path.write_bytes(migration_candidate_bytes)
    manifest_output_path.write_text(json.dumps(output_manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({
        "result": "proposal_generated_review_only",
        "sql": str(output_path.relative_to(REPO_ROOT)),
        "manifest": str(manifest_output_path.relative_to(REPO_ROOT)),
        "includedStatements": len(included_sql),
        "includedObjects": len(included_objects),
        "rehearsalSql": str(rehearsal_path.relative_to(REPO_ROOT)) if rehearsal_path else None,
        "installationReviewSql": str(installation_path.relative_to(REPO_ROOT)) if installation_path else None,
        "migrationCandidateSql": str(migration_candidate_path.relative_to(REPO_ROOT)) if migration_candidate_path else None,
        "applyReady": False,
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except ProposalError as exc:
        print(f"proposal generation refused: {exc}", file=sys.stderr)
        raise SystemExit(2)
