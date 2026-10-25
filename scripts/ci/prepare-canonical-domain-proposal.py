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
        value = getattr(getattr(option, "arg", None), "sval", None)
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
            definition = getattr(command, "def", None)
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
    if output_path == manifest_output_path:
        raise ProposalError("SQL and JSON outputs must be different files")

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
    render = RawStream(semicolon_after_last_statement=True)
    included_sql: list[str] = []
    included_objects: list[dict[str, Any]] = []
    omitted = Counter()
    omitted_e2e: list[dict[str, Any]] = []
    extension_prerequisites: dict[str, dict[str, str | None]] = {}
    external_references: set[tuple[int, str, str]] = set()
    statement_counts = Counter()
    security_definer_candidates: list[dict[str, Any]] = []

    known_non_object = {
        "VariableSetStmt": "pg_dump_session_setting",
        "AlterOwnerStmt": "ownership_requires_manual_review",
        "AlterDefaultPrivilegesStmt": "default_acl_requires_manual_review",
        "GrantStmt": "acl_requires_manual_review",
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
        if kind in known_non_object:
            omitted[known_non_object[kind]] += 1
            continue
        if kind not in supported_scoped:
            raise ProposalError(f"Unclassified AST statement {kind} at source line {line}; refusing partial proposal")

        schema, name = target_for(statement)
        if kind == "AlterTableStmt" and is_owner_alter_table(statement):
            omitted["table_ownership_requires_manual_review"] += 1
            continue
        if schema not in TARGET_SCHEMAS:
            omitted[f"out_of_scope:{kind}"] += 1
            continue
        if (schema, name or "") in EXCLUDED_TABLES:
            omitted_e2e.append({"schema": schema, "name": name, "sourceLine": line, "kind": kind})
            omitted["e2e_ledger_excluded"] += 1
            continue

        sql = render(statement).strip()
        if not sql.endswith(";"):
            sql += ";"
        reparsed = parse_sql(sql)
        if len(reparsed) != 1 or reparsed[0].stmt != statement:
            raise ProposalError(f"AST round-trip mismatch for {kind} at source line {line}")
        included_sql.append(f"-- snapshot source line {line}: {kind}\n{sql}")
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

    output_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_bytes(proposal_bytes)
    manifest_output_path.write_text(json.dumps(output_manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({
        "result": "proposal_generated_review_only",
        "sql": str(output_path.relative_to(REPO_ROOT)),
        "manifest": str(manifest_output_path.relative_to(REPO_ROOT)),
        "includedStatements": len(included_sql),
        "includedObjects": len(included_objects),
        "applyReady": False,
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except ProposalError as exc:
        print(f"proposal generation refused: {exc}", file=sys.stderr)
        raise SystemExit(2)
