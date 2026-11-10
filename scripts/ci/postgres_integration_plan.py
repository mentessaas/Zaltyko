#!/usr/bin/env python3
"""Plan and verify the disposable PostgreSQL integration job.

The reviewed schema replay (`verify-sandbox-schema-replay.sh`) stays the single
source of truth: this module only reads it. It extracts the pinned replay
constants and the ordered suite batches of `run_disposable_postgres_suites`,
refuses any drift in the replay's migration steps, verifies every reused SQL
source against the reviewed SHA-256 pins, discovers newer PostgreSQL suites
anywhere under `tests/`, and finally checks the vitest JSON reports.

Subcommands (none of them touches a database):
  verify-pins     check the replay structure and the replay script, baseline,
                  RLS hardening, Owner seed and tenant fixture hashes; print
                  the constants as JSON.
  plan            print the ordered suite batches as JSON.
  verify-reports  check vitest JSON reports against a plan; print a summary
                  with names and counts only; exit 1 if any planned suite
                  failed, was skipped, ran no test or did not report.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path

REPLAY_SCRIPT = "scripts/ci/verify-sandbox-schema-replay.sh"
MANIFEST = "supabase/schema-snapshot-manifest.json"
TENANT_FIXTURE = "scripts/ci/sandbox-tenant-isolation.sql"

# Suites matching these globs anywhere under tests/ are PostgreSQL suites.
DISCOVERY_GLOBS = ("*-pg.test.ts", "*-postgres.integration.test.ts")

REMOTE_SANDBOX = "remote-sandbox"
OWN_HARNESS = "own-harness"

# Explicit exclusions, each with a category and a reason. Every entry must name
# an existing discovered suite, so a stale exclusion fails the job instead of
# silently hiding a suite.
EXCLUDED_SUITES: dict[str, dict[str, str]] = {
    "tests/saas-preview-regularization-pg.test.ts": {
        "category": REMOTE_SANDBOX,
        "reason": (
            "Needs the remote SaaS preview sandbox (ZALTYKO_SANDBOX_READONLY_TESTS); "
            "never runs against disposable local Postgres."
        ),
    },
    "tests/saas-preview-readonly-boundaries-pg.test.ts": {
        "category": REMOTE_SANDBOX,
        "reason": (
            "Needs the remote SaaS preview sandbox (ZALTYKO_SANDBOX_READONLY_TESTS); "
            "never runs against disposable local Postgres."
        ),
    },
    "tests/lib/stripe-charge-collection-concurrency.real-pg.test.ts": {
        "category": OWN_HARNESS,
        "reason": (
            "Has its own harness (scripts/run-charge-concurrency-test.sh) and switch "
            "(CHARGE_CONCURRENCY_TEST, refused by this job) and TRUNCATEs its tables; "
            "it must not share the integration database."
        ),
    },
}
REMOTE_SANDBOX_SUITES = frozenset(
    path for path, entry in EXCLUDED_SUITES.items() if entry["category"] == REMOTE_SANDBOX
)

# Suites that must not share a database with any other suite. Each entry runs
# alone, after every shared batch, on a freshly rebuilt disposable database.
# Every entry needs a reason and must name an existing discovered suite that
# the replay does not already run.
FRESH_DATABASE_SUITES: dict[str, str] = {
    "tests/saas-reconciliation-service-pg.test.ts": (
        "Claims SaaS webhook events across the whole database and its beforeEach "
        "requires that no claimable event exists anywhere, so it cannot share a "
        "database with suites that seed SaaS events."
    ),
}

# Every `readonly *_NAME=` constant of the replay, and the exact order in which
# the replay places them in its disposable migrations directory before
# run_disposable_postgres_suites. This job applies the first six in the same
# order; the two probes only prove the baseline guards and change nothing.
EXPECTED_REPLAY_MIGRATION_SEQUENCE = (
    "ROLE_PROBE_NAME",
    "AUTH_JWT_MIGRATION_NAME",
    "MIGRATION_NAME",
    "RLS_HARDENING_MIGRATION_NAME",
    "BOOTSTRAP_SEED_MIGRATION_NAME",
    "TENANT_MIGRATION_NAME",
    "GUARD_PROBE_NAME",
    "UNMARKED_PROBE_NAME",
)
APPLIED_REPLAY_MIGRATIONS = EXPECTED_REPLAY_MIGRATION_SEQUENCE[:6]

REPLAY_CONSTANTS = (
    *EXPECTED_REPLAY_MIGRATION_SEQUENCE,
    "BASELINE_SHA256",
    "RLS_HARDENING_MIGRATION_SHA256",
    "BOOTSTRAP_SEED_MIGRATION_SHA256",
    "SUPABASE_CLI_VERSION",
)
SAFE_MIGRATION_NAME = re.compile(r"^[0-9]{14}_[a-z0-9_]+\.sql$")
SAFE_SUITE_PATH = re.compile(r"^tests/(?:[A-Za-z0-9._-]+/)*[A-Za-z0-9._-]+\.test\.ts$")


class PlanError(RuntimeError):
    """The replay sources, suite layout or reports are not the reviewed shape."""


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _replay_text(root: Path) -> str:
    path = root / REPLAY_SCRIPT
    if not path.is_file():
        raise PlanError("The reviewed schema replay script is missing.")
    return path.read_text(encoding="utf-8")


def replay_constants(text: str) -> dict[str, str]:
    declared_names = re.findall(r"^readonly ([A-Z0-9_]+_NAME)=", text, flags=re.MULTILINE)
    if sorted(declared_names) != sorted(EXPECTED_REPLAY_MIGRATION_SEQUENCE):
        raise PlanError(
            "The replay declares a different set of migration name constants: "
            + ", ".join(sorted(set(declared_names) ^ set(EXPECTED_REPLAY_MIGRATION_SEQUENCE)) or "duplicates")
        )
    constants: dict[str, str] = {}
    for name in REPLAY_CONSTANTS:
        matches = re.findall(rf'^readonly {name}="([^"$`\\]+)"$', text, flags=re.MULTILINE)
        if len(matches) != 1:
            raise PlanError(f"The replay script must define {name} exactly once.")
        constants[name] = matches[0]
    for name, value in constants.items():
        if name.endswith("_SHA256") and not re.fullmatch(r"[0-9a-f]{64}", value):
            raise PlanError(f"{name} is not a lowercase SHA-256 pin.")
        if name.endswith("_NAME") and not SAFE_MIGRATION_NAME.fullmatch(value):
            raise PlanError(f"{name} is not a timestamped SQL migration name.")
    if not re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+", constants["SUPABASE_CLI_VERSION"]):
        raise PlanError("The pinned Supabase CLI version is malformed.")
    return constants


def replay_migration_sequence(text: str) -> list[str]:
    """Constants placed in the disposable migrations dir, in replay order."""
    end = text.find("\nrun_disposable_postgres_suites() {")
    if end < 0:
        raise PlanError("run_disposable_postgres_suites was not found in the replay script.")
    sequence: list[str] = []
    for match in re.finditer(r"\$CI_WORKDIR/supabase/migrations/\$([A-Z0-9_]+_NAME)\b", text[:end]):
        # cp/chmod/rm of the same file are one step.
        if not sequence or sequence[-1] != match.group(1):
            sequence.append(match.group(1))
    return sequence


def verify_replay_structure(text: str) -> None:
    sequence = replay_migration_sequence(text)
    if tuple(sequence) != EXPECTED_REPLAY_MIGRATION_SEQUENCE:
        raise PlanError(
            "The replay migration steps drifted from the reviewed sequence: "
            + " -> ".join(sequence)
        )


def replay_suite_batches(text: str) -> list[list[str]]:
    """Ordered vitest batches from `run_disposable_postgres_suites`."""
    match = re.search(r"^run_disposable_postgres_suites\(\) \{\n(.*?)^\}$", text, flags=re.MULTILINE | re.DOTALL)
    if match is None:
        raise PlanError("run_disposable_postgres_suites was not found in the replay script.")
    body = match.group(1)
    batches: list[list[str]] = []
    for command in re.finditer(r"pnpm exec vitest run --project web((?:\s+tests/\S+)+)", body):
        files = command.group(1).split()
        if not files or not all(SAFE_SUITE_PATH.fullmatch(item) for item in files):
            raise PlanError("A replay suite batch names an unexpected path.")
        batches.append(files)
    invocations = len(re.findall(r"pnpm exec vitest run", body))
    if not batches or invocations != len(batches):
        raise PlanError("Every replay vitest invocation must list explicit web suites.")
    flat = [item for batch in batches for item in batch]
    if len(flat) != len(set(flat)):
        raise PlanError("A replay suite is listed twice.")
    return batches


def discover_suites(root: Path) -> list[str]:
    found: set[str] = set()
    for pattern in DISCOVERY_GLOBS:
        for path in (root / "tests").rglob(pattern):
            if path.is_file() and "node_modules" not in path.parts:
                relative = path.relative_to(root).as_posix()
                if not SAFE_SUITE_PATH.fullmatch(relative):
                    raise PlanError(f"A discovered suite has an unexpected path: {relative}")
                found.add(relative)
    return sorted(found)


def build_plan(
    root: Path,
    fresh_database_suites: dict[str, str] | None = None,
) -> dict[str, object]:
    if fresh_database_suites is None:
        fresh_database_suites = FRESH_DATABASE_SUITES
    text = _replay_text(root)
    replay_batches = replay_suite_batches(text)
    replay_suites = [item for batch in replay_batches for item in batch]
    discovered = discover_suites(root)

    for suite in replay_suites:
        if not (root / suite).is_file():
            raise PlanError(f"A replay suite is missing: {suite}")
        if suite in REMOTE_SANDBOX_SUITES:
            raise PlanError(f"A remote-sandbox suite cannot run on disposable Postgres: {suite}")
        if suite in EXCLUDED_SUITES:
            raise PlanError(f"An excluded suite is listed by the replay: {suite}")
    for suite, entry in EXCLUDED_SUITES.items():
        if entry.get("category") not in {REMOTE_SANDBOX, OWN_HARNESS} or not entry.get("reason", "").strip():
            raise PlanError(f"An exclusion needs a known category and a reason: {suite}")
        if suite not in discovered:
            raise PlanError(f"Stale exclusion; the suite no longer exists: {suite}")
    for suite, reason in fresh_database_suites.items():
        if not reason.strip():
            raise PlanError(f"A fresh-database suite needs a reason: {suite}")
        if suite not in discovered:
            raise PlanError(f"Stale fresh-database entry; the suite no longer exists: {suite}")
        if suite in replay_suites or suite in EXCLUDED_SUITES:
            raise PlanError(f"A fresh-database suite cannot also be a replay or excluded suite: {suite}")

    additional = [
        suite for suite in discovered if suite not in replay_suites and suite not in EXCLUDED_SUITES
    ]
    shared_additional = [suite for suite in additional if suite not in fresh_database_suites]
    fresh_additional = [suite for suite in additional if suite in fresh_database_suites]
    batches = [{"source": "replay", "database": "shared", "suites": batch} for batch in replay_batches]
    # Each discovered suite runs alone, after the reviewed replay order, so a
    # new candidate cannot change what an older suite observes. Suites that
    # need their own database come last, each on a freshly rebuilt one.
    batches += [{"source": "discovered", "database": "shared", "suites": [suite]} for suite in shared_additional]
    batches += [{"source": "discovered", "database": "fresh", "suites": [suite]} for suite in fresh_additional]
    planned = [item for batch in batches for item in batch["suites"]]
    uncovered = sorted(set(discovered) - set(planned) - set(EXCLUDED_SUITES))
    if uncovered:
        raise PlanError("Discovered suites are neither planned nor excluded: " + ", ".join(uncovered))
    return {
        "batches": batches,
        "replay_suites": replay_suites,
        "discovered_suites": additional,
        "excluded_suites": [
            {"path": path, "category": entry["category"], "reason": entry["reason"]}
            for path, entry in EXCLUDED_SUITES.items()
        ],
        "fresh_database_suites": [
            {"path": path, "reason": reason} for path, reason in sorted(fresh_database_suites.items())
        ],
        "suite_count": len(planned),
    }


def verify_pins(root: Path) -> dict[str, str]:
    text = _replay_text(root)
    # Structural drift is reported before the hash check so a reviewer sees
    # which step changed, not only that the bytes differ.
    constants = replay_constants(text)
    verify_replay_structure(text)
    try:
        manifest = json.loads((root / MANIFEST).read_text(encoding="utf-8"))
        validation = manifest["replay_validation"]
        baseline = manifest["baseline"]
        seed = manifest["authored_reference_seed"]
    except (OSError, KeyError, TypeError, json.JSONDecodeError) as error:
        raise PlanError("The schema snapshot manifest is missing or malformed.") from error

    if validation.get("replay_script_path") != REPLAY_SCRIPT:
        raise PlanError("The manifest pins a different replay script path.")
    if hashlib.sha256(text.encode("utf-8")).hexdigest() != validation.get("replay_script_sha256"):
        raise PlanError("The replay script differs from the manifest pin.")
    if validation.get("supabase_cli_version") != constants["SUPABASE_CLI_VERSION"]:
        raise PlanError("The replay CLI version differs from the manifest pin.")

    baseline_path = f"supabase/schema-snapshots/{constants['MIGRATION_NAME']}"
    if baseline.get("path") != baseline_path:
        raise PlanError("The manifest baseline path differs from the replay script.")
    seed_path = f"supabase/migrations/{constants['BOOTSTRAP_SEED_MIGRATION_NAME']}"
    if seed.get("path") != seed_path:
        raise PlanError("The manifest Owner seed path differs from the replay script.")
    hardening_path = f"supabase/migrations/{constants['RLS_HARDENING_MIGRATION_NAME']}"

    checks = (
        (baseline_path, {constants["BASELINE_SHA256"], baseline.get("sha256")}),
        (hardening_path, {constants["RLS_HARDENING_MIGRATION_SHA256"]}),
        (seed_path, {constants["BOOTSTRAP_SEED_MIGRATION_SHA256"], seed.get("sha256")}),
        (TENANT_FIXTURE, {validation.get("tenant_fixture_sha256")}),
    )
    for relative, pins in checks:
        if len(pins) != 1 or None in pins:
            raise PlanError(f"The replay script and manifest disagree on the pin for {relative}.")
        path = root / relative
        if not path.is_file():
            raise PlanError(f"A reviewed SQL source is missing: {relative}")
        if _sha256(path) != next(iter(pins)):
            raise PlanError(f"A reviewed SQL source differs from its pin: {relative}")
    executable = sorted(p.name for p in (root / "supabase/migrations").glob("*.sql"))
    if constants["MIGRATION_NAME"] in executable:
        raise PlanError("The current-state schema snapshot must stay outside executable migrations.")

    return {
        **constants,
        "APPLIED_MIGRATION_SEQUENCE": " ".join(APPLIED_REPLAY_MIGRATIONS),
        "BASELINE_PATH": baseline_path,
        "RLS_HARDENING_PATH": hardening_path,
        "BOOTSTRAP_SEED_PATH": seed_path,
        "TENANT_FIXTURE_PATH": TENANT_FIXTURE,
    }


def verify_reports(plan: dict, report_dir: Path, root: Path) -> tuple[str, list[str], dict[str, int]]:
    """Check vitest JSON reports. Returns (markdown summary, problems, totals)."""
    planned = [suite for batch in plan["batches"] for suite in batch["suites"]]
    results: dict[str, dict[str, object]] = {}
    unreadable = []
    for report in sorted(report_dir.glob("batch-*.json")):
        try:
            payload = json.loads(report.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            unreadable.append(report.name)
            continue
        for item in payload.get("testResults", []) or []:
            raw_name = str(item.get("name", "?"))
            try:
                name = Path(raw_name).resolve().relative_to(root).as_posix()
            except ValueError:
                name = raw_name
            counts = results.setdefault(name, {"passed": 0, "failed": 0, "skipped": 0, "file_failed": False})
            if item.get("status") == "failed":
                counts["file_failed"] = True
            for assertion in item.get("assertionResults", []) or []:
                status = assertion.get("status")
                key = status if status in {"passed", "failed"} else "skipped"
                counts[key] += 1

    problems = [f"{name}: unreadable vitest report" for name in unreadable]
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
            problems.append(f"{suite}: failed ({counts['failed']} failed test(s))")
        elif counts["passed"] == 0:
            state = "NO TESTS RAN"
            problems.append(f"{suite}: no passed tests")
        elif counts["skipped"]:
            state = "SKIPPED TESTS"
            problems.append(f"{suite}: {counts['skipped']} skipped/todo test(s) with ZALTYKO_PG_INTEGRATION=1")
        rows.append((suite, counts["passed"], counts["failed"], counts["skipped"], state))
    for suite in sorted(set(results) - set(planned)):
        problems.append(f"{suite}: reported but not planned")

    totals = {
        "suites": len(planned),
        "passed": sum(row[1] for row in rows if isinstance(row[1], int)),
        "failed": sum(row[2] for row in rows if isinstance(row[2], int)),
    }
    discovered = set(plan.get("discovered_suites", []))
    fresh = {item["path"] for item in plan.get("fresh_database_suites", [])}
    lines = [
        "## Postgres integration",
        "",
        f"Disposable local Supabase Postgres (native, loopback). Suites: **{totals['suites']}** "
        f"({totals['suites'] - len(discovered)} from run_disposable_postgres_suites, {len(discovered)} discovered, "
        f"{len(fresh)} on a fresh database). Tests passed: **{totals['passed']}**, failed: **{totals['failed']}**.",
        "",
        "| Suite | Origin | Database | Passed | Failed | Skipped | State |",
        "| --- | --- | --- | ---: | ---: | ---: | --- |",
    ]
    for suite, passed, failed, skipped, state in rows:
        origin = "discovered" if suite in discovered else "replay"
        database = "fresh" if suite in fresh else "shared"
        lines.append(f"| `{suite}` | {origin} | {database} | {passed} | {failed} | {skipped} | {state} |")
    lines += ["", "Excluded:"]
    lines += [
        f"- `{item['path']}` ({item.get('category', '?')}): {item['reason']}" for item in plan.get("excluded_suites", [])
    ]
    return "\n".join(lines) + "\n", problems, totals


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("command", choices=("verify-pins", "plan", "verify-reports"))
    parser.add_argument("--root", default=str(Path(__file__).resolve().parents[2]))
    parser.add_argument(
        "--fresh-database-suites-json",
        help="plan: override FRESH_DATABASE_SUITES with a JSON object (contract tests only).",
    )
    parser.add_argument("--plan", help="verify-reports: plan JSON file.")
    parser.add_argument("--reports", help="verify-reports: directory with batch-*.json vitest reports.")
    parser.add_argument("--summary", help="verify-reports: file to append the markdown summary to.")
    args = parser.parse_args(argv)
    root = Path(args.root).resolve()
    try:
        if args.command == "verify-pins":
            result: object = verify_pins(root)
        elif args.command == "plan":
            fresh = None
            if args.fresh_database_suites_json is not None:
                try:
                    fresh = json.loads(args.fresh_database_suites_json)
                except json.JSONDecodeError as error:
                    raise PlanError("The fresh-database override is not JSON.") from error
                if not isinstance(fresh, dict) or not all(
                    isinstance(key, str) and isinstance(value, str) for key, value in fresh.items()
                ):
                    raise PlanError("The fresh-database override must map suite paths to reasons.")
            result = build_plan(root, fresh)
        else:
            if not args.plan or not args.reports:
                raise PlanError("verify-reports needs --plan and --reports.")
            try:
                plan = json.loads(Path(args.plan).read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError) as error:
                raise PlanError("The plan file is missing or malformed.") from error
            summary, problems, totals = verify_reports(plan, Path(args.reports), root)
            print(summary)
            if args.summary:
                with open(args.summary, "a", encoding="utf-8") as handle:
                    handle.write(summary)
            if problems:
                print("PostgreSQL integration problems:", file=sys.stderr)
                for problem in problems:
                    print(f"  - {problem}", file=sys.stderr)
                return 1
            print(f"PASS: {totals['suites']} PostgreSQL suites, {totals['passed']} tests on disposable local Postgres.")
            return 0
    except PlanError as error:
        print(f"PostgreSQL integration plan refused: {error}", file=sys.stderr)
        return 1
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
