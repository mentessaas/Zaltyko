#!/usr/bin/env python3
"""Plan the disposable PostgreSQL integration job without touching a database.

The reviewed schema replay (`verify-sandbox-schema-replay.sh`) stays the single
source of truth: this module only reads it. It extracts the pinned replay
constants and the ordered suite batches of `run_disposable_postgres_suites`,
verifies every reused SQL source against the reviewed SHA-256 pins, and then
discovers newer PostgreSQL suites that the replay does not list yet.

Subcommands:
  verify-pins  check the replay script, baseline, RLS hardening, Owner seed and
               tenant fixture hashes; print the constants as JSON.
  plan         print the ordered suite batches as JSON (no hashes needed).
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

# Suites matching these globs are PostgreSQL integration suites.
DISCOVERY_GLOBS = ("*-pg.test.ts", "*-postgres.integration.test.ts")

# Explicit exclusions. Every entry needs a reason and must name an existing
# file, so a stale exclusion fails the job instead of silently hiding a suite.
EXCLUDED_SUITES: dict[str, str] = {
    "tests/saas-preview-regularization-pg.test.ts": (
        "Needs the remote SaaS preview sandbox (ZALTYKO_SANDBOX_READONLY_TESTS); "
        "never runs against disposable local Postgres."
    ),
    "tests/saas-preview-readonly-boundaries-pg.test.ts": (
        "Needs the remote SaaS preview sandbox (ZALTYKO_SANDBOX_READONLY_TESTS); "
        "never runs against disposable local Postgres."
    ),
}
REMOTE_SANDBOX_SUITES = frozenset(EXCLUDED_SUITES)

REPLAY_CONSTANTS = (
    "ROLE_PROBE_NAME",
    "AUTH_JWT_MIGRATION_NAME",
    "MIGRATION_NAME",
    "BASELINE_SHA256",
    "RLS_HARDENING_MIGRATION_NAME",
    "RLS_HARDENING_MIGRATION_SHA256",
    "BOOTSTRAP_SEED_MIGRATION_NAME",
    "BOOTSTRAP_SEED_MIGRATION_SHA256",
    "TENANT_MIGRATION_NAME",
    "SUPABASE_CLI_VERSION",
)
SAFE_MIGRATION_NAME = re.compile(r"^[0-9]{14}_[a-z0-9_]+\.sql$")
SAFE_SUITE_PATH = re.compile(r"^tests/[A-Za-z0-9._-]+\.test\.ts$")


class PlanError(RuntimeError):
    """The replay sources or suite layout are not the reviewed shape."""


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _replay_text(root: Path) -> str:
    path = root / REPLAY_SCRIPT
    if not path.is_file():
        raise PlanError("The reviewed schema replay script is missing.")
    return path.read_text(encoding="utf-8")


def replay_constants(text: str) -> dict[str, str]:
    constants: dict[str, str] = {}
    for name in REPLAY_CONSTANTS:
        matches = re.findall(rf'^readonly {name}="([^"$`\\]+)"$', text, flags=re.MULTILINE)
        if len(matches) != 1:
            raise PlanError(f"The replay script must define {name} exactly once.")
        constants[name] = matches[0]
    for name in REPLAY_CONSTANTS:
        value = constants[name]
        if name.endswith("_SHA256") and not re.fullmatch(r"[0-9a-f]{64}", value):
            raise PlanError(f"{name} is not a lowercase SHA-256 pin.")
        if name.endswith("_NAME") and not SAFE_MIGRATION_NAME.fullmatch(value):
            raise PlanError(f"{name} is not a timestamped SQL migration name.")
    if not re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+", constants["SUPABASE_CLI_VERSION"]):
        raise PlanError("The pinned Supabase CLI version is malformed.")
    return constants


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
        for path in (root / "tests").glob(pattern):
            if path.is_file():
                found.add(path.relative_to(root).as_posix())
    return sorted(found)


def build_plan(root: Path) -> dict[str, object]:
    text = _replay_text(root)
    replay_batches = replay_suite_batches(text)
    replay_suites = [item for batch in replay_batches for item in batch]
    discovered = discover_suites(root)

    for suite in replay_suites:
        if not (root / suite).is_file():
            raise PlanError(f"A replay suite is missing: {suite}")
        if suite in REMOTE_SANDBOX_SUITES:
            raise PlanError(f"A remote-sandbox suite cannot run on disposable Postgres: {suite}")
    for suite in EXCLUDED_SUITES:
        if suite not in discovered:
            raise PlanError(f"Stale exclusion; the suite no longer exists: {suite}")

    additional = [
        suite for suite in discovered if suite not in replay_suites and suite not in EXCLUDED_SUITES
    ]
    batches = [{"source": "replay", "suites": batch} for batch in replay_batches]
    # Each discovered suite runs alone, after the reviewed replay order, so a
    # new candidate cannot change what an older suite observes.
    batches += [{"source": "discovered", "suites": [suite]} for suite in additional]
    planned = [item for batch in batches for item in batch["suites"]]
    uncovered = sorted(set(discovered) - set(planned) - set(EXCLUDED_SUITES))
    if uncovered:
        raise PlanError("Discovered suites are neither planned nor excluded: " + ", ".join(uncovered))
    return {
        "batches": batches,
        "replay_suites": replay_suites,
        "discovered_suites": additional,
        "excluded_suites": [{"path": path, "reason": reason} for path, reason in EXCLUDED_SUITES.items()],
        "suite_count": len(planned),
    }


def verify_pins(root: Path) -> dict[str, str]:
    text = _replay_text(root)
    constants = replay_constants(text)
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
        "BASELINE_PATH": baseline_path,
        "RLS_HARDENING_PATH": hardening_path,
        "BOOTSTRAP_SEED_PATH": seed_path,
        "TENANT_FIXTURE_PATH": TENANT_FIXTURE,
    }


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("verify-pins", "plan"))
    parser.add_argument("--root", default=str(Path(__file__).resolve().parents[2]))
    args = parser.parse_args(argv)
    root = Path(args.root).resolve()
    try:
        result = verify_pins(root) if args.command == "verify-pins" else build_plan(root)
    except PlanError as error:
        print(f"PostgreSQL integration plan refused: {error}", file=sys.stderr)
        return 1
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
