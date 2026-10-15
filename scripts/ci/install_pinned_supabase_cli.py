#!/usr/bin/env python3
"""Verify and safely install the pinned Supabase CLI archive on GitHub runners."""

from __future__ import annotations

import hashlib
import os
from pathlib import Path
import shutil
import sys
import tarfile

CLI_VERSION = "2.84.2"
ARCHIVE_SHA256 = "620a5f6ea7b60f9b4fe112a5d72464ea0e53d04022035641674a2e6d121e0eb5"
BINARY_SHA256 = "3132b218461bf90d4cd5983b27b44031cd9b6c797c259a431b2e2520b5f7bdce"
BINARY_SIZE = 94_924_984
ARCHIVE_MEMBER = "supabase"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def extract_verified_cli(archive_path: Path, destination: Path) -> Path:
    if sha256_file(archive_path) != ARCHIVE_SHA256:
        raise ValueError("Supabase CLI archive SHA-256 mismatch; refusing extraction.")

    if destination.exists():
        raise FileExistsError("Supabase CLI destination already exists; refusing overwrite.")
    destination.mkdir(parents=True)
    temporary_binary = destination / ".supabase.tmp"
    installed_binary = destination / ARCHIVE_MEMBER

    try:
        with tarfile.open(archive_path, mode="r:gz") as archive:
            members = archive.getmembers()
            if len(members) != 1:
                raise ValueError("Supabase CLI archive must contain exactly one member.")

            member = members[0]
            if member.name != ARCHIVE_MEMBER or not member.isfile():
                raise ValueError(
                    "Supabase CLI archive member must be one regular file named 'supabase'."
                )
            if member.size != BINARY_SIZE:
                raise ValueError("Supabase CLI binary size mismatch; refusing extraction.")

            source = archive.extractfile(member)
            if source is None:
                raise ValueError("Supabase CLI archive member could not be read.")
            with source, temporary_binary.open("xb") as target:
                shutil.copyfileobj(source, target, length=1024 * 1024)

        if temporary_binary.stat().st_size != BINARY_SIZE:
            raise ValueError("Extracted Supabase CLI binary size mismatch.")
        if sha256_file(temporary_binary) != BINARY_SHA256:
            raise ValueError("Supabase CLI binary SHA-256 mismatch; refusing installation.")

        temporary_binary.chmod(0o755)
        os.replace(temporary_binary, installed_binary)
        return installed_binary
    except BaseException:
        shutil.rmtree(destination, ignore_errors=True)
        raise


def main() -> int:
    if os.environ.get("GITHUB_ACTIONS") != "true":
        raise RuntimeError("Pinned Supabase CLI installation is restricted to GitHub Actions.")
    runner_temp_value = os.environ.get("RUNNER_TEMP")
    if not runner_temp_value:
        raise RuntimeError("RUNNER_TEMP is required; refusing Supabase CLI installation.")
    if len(sys.argv) != 2:
        raise RuntimeError("Usage: install_pinned_supabase_cli.py <verified-release-archive>")

    runner_temp = Path(runner_temp_value).resolve(strict=True)
    archive_path = Path(sys.argv[1]).resolve(strict=True)
    if runner_temp not in archive_path.parents:
        raise RuntimeError("Supabase CLI archive must be inside RUNNER_TEMP.")

    binary_path = extract_verified_cli(
        archive_path, runner_temp / f"supabase-cli-{CLI_VERSION}"
    )
    print(f"Verified Supabase CLI {CLI_VERSION} installed under RUNNER_TEMP.")
    print(binary_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
