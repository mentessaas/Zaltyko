#!/usr/bin/env python3
"""Install the pinned Supabase CLI from a verified Linux x64 release archive.

This CI helper intentionally requires RUNNER_TEMP and never writes into the
checkout or a user home directory. It extracts only the exact regular file
named `supabase`, verifies the binary digest, and refuses to overwrite installs.
"""

from __future__ import annotations

import argparse
import hashlib
import os
import platform
import re
import shutil
import sys
import tarfile
import tempfile
from pathlib import Path


CLI_VERSION = "2.84.2"
EXPECTED_LINUX_X64_SHA256 = (
    "3132b218461bf90d4cd5983b27b44031cd9b6c797c259a431b2e2520b5f7bdce"
)
MAX_BINARY_BYTES = 512 * 1024 * 1024


class InstallError(RuntimeError):
    """Raised when the archive is not the pinned CLI release."""


def _copy_verified_member(
    archive_path: Path,
    binary_path: Path,
    expected_sha256: str,
    max_bytes: int = MAX_BINARY_BYTES,
) -> None:
    try:
        archive = tarfile.open(archive_path, mode="r:gz")
    except (OSError, tarfile.TarError) as error:
        raise InstallError("Release archive is not a readable gzip tarball.") from error

    with archive:
        matches = [member for member in archive.getmembers() if member.name == "supabase"]
        if len(matches) != 1:
            raise InstallError("Release archive must contain exactly one root `supabase` file.")

        member = matches[0]
        if not member.isfile() or member.issparse():
            raise InstallError("The root `supabase` archive member must be a regular file.")
        if member.size <= 0 or member.size > max_bytes:
            raise InstallError("The Supabase CLI binary has an invalid size.")

        source = archive.extractfile(member)
        if source is None:
            raise InstallError("The Supabase CLI binary could not be read from the archive.")

        digest = hashlib.sha256()
        copied = 0
        try:
            with source, binary_path.open("xb") as destination:
                while True:
                    chunk = source.read(1024 * 1024)
                    if not chunk:
                        break
                    copied += len(chunk)
                    if copied > max_bytes:
                        raise InstallError("The Supabase CLI binary exceeds the size limit.")
                    digest.update(chunk)
                    destination.write(chunk)
        except OSError as error:
            raise InstallError("The Supabase CLI binary could not be staged safely.") from error

        if copied != member.size:
            raise InstallError("The extracted Supabase CLI size does not match the archive header.")
        actual_sha256 = digest.hexdigest()
        if actual_sha256 != expected_sha256:
            raise InstallError(
                "The Supabase CLI binary SHA-256 does not match the pinned release "
                f"(expected {expected_sha256}, found {actual_sha256})."
            )
        binary_path.chmod(0o755)


def install_cli(
    archive_path: Path,
    runner_temp: Path,
    expected_sha256: str = EXPECTED_LINUX_X64_SHA256,
    max_bytes: int = MAX_BINARY_BYTES,
) -> Path:
    """Verify and install the release under RUNNER_TEMP without overwriting."""
    if not re.fullmatch(r"[0-9a-f]{64}", expected_sha256):
        raise InstallError("The pinned Supabase CLI digest must be a lowercase SHA-256 value.")
    if max_bytes <= 0:
        raise InstallError("The Supabase CLI size limit must be positive.")
    if not archive_path.is_file():
        raise InstallError("The downloaded Supabase CLI archive is missing.")
    if not runner_temp.is_dir():
        raise InstallError("RUNNER_TEMP must name an existing directory.")

    destination = runner_temp / f"supabase-cli-{CLI_VERSION}"
    staging = Path(tempfile.mkdtemp(prefix=".supabase-cli-staging-", dir=runner_temp))
    destination_created = False
    try:
        binary_path = staging / "supabase"
        _copy_verified_member(archive_path, binary_path, expected_sha256, max_bytes)
        try:
            destination.mkdir(mode=0o755)
        except FileExistsError as error:
            raise InstallError(
                "The pinned Supabase CLI destination already exists; refusing overwrite."
            ) from error
        destination_created = True
        os.link(binary_path, destination / "supabase")
    except OSError as error:
        if destination_created:
            shutil.rmtree(destination, ignore_errors=True)
        raise InstallError(
            "The verified Supabase CLI could not be published into RUNNER_TEMP."
        ) from error
    except BaseException:
        if destination_created:
            shutil.rmtree(destination, ignore_errors=True)
        raise
    finally:
        shutil.rmtree(staging, ignore_errors=True)

    return destination / "supabase"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path, help="Downloaded Supabase CLI release tarball")
    args = parser.parse_args()

    runner_temp_value = os.environ.get("RUNNER_TEMP")
    if not runner_temp_value:
        parser.error("RUNNER_TEMP is required; this installer is for disposable CI runners only.")
    if platform.system() != "Linux" or platform.machine().lower() not in {"x86_64", "amd64"}:
        parser.error("Only the pinned Linux x64 Supabase CLI artifact is supported.")

    try:
        installed = install_cli(args.archive, Path(runner_temp_value))
    except InstallError as error:
        print(f"Supabase CLI installation refused: {error}", file=sys.stderr)
        return 1

    print(f"Installed verified Supabase CLI {CLI_VERSION} at {installed}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
