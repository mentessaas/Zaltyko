#!/usr/bin/env python3
"""Install the separately pinned Supabase CLI for disposable schema replay CI."""

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


CLI_VERSION = "2.119.0"
EXPECTED_ARCHIVE_SHA256 = (
    "bf1c3ae93be98533eb8a3105dbf4564bd0b2d9dc24690d8a920f980ef975c1b4"
)
MAX_ARCHIVE_BYTES = 200 * 1024 * 1024
MAX_BINARY_BYTES = 512 * 1024 * 1024


class InstallError(RuntimeError):
    """Raised when the archive is not the pinned schema replay CLI release."""


def _archive_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        while chunk := source.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def install_cli(
    archive_path: Path,
    runner_temp: Path,
    expected_archive_sha256: str = EXPECTED_ARCHIVE_SHA256,
    max_bytes: int = MAX_BINARY_BYTES,
) -> Path:
    """Verify the whole release archive, then safely install its root binary."""
    if not re.fullmatch(r"[0-9a-f]{64}", expected_archive_sha256):
        raise InstallError("The pinned archive digest must be lowercase SHA-256.")
    if max_bytes <= 0:
        raise InstallError("The CLI binary size limit must be positive.")
    if not archive_path.is_file():
        raise InstallError("The downloaded Supabase CLI archive is missing.")
    if archive_path.stat().st_size > MAX_ARCHIVE_BYTES:
        raise InstallError("The downloaded Supabase CLI archive exceeds the size limit.")
    if not runner_temp.is_dir():
        raise InstallError("RUNNER_TEMP must name an existing directory.")
    try:
        if _archive_sha256(archive_path) != expected_archive_sha256:
            raise InstallError("The Supabase CLI archive SHA-256 does not match the pin.")
    except OSError as error:
        raise InstallError("The downloaded Supabase CLI archive could not be read safely.") from error

    destination = runner_temp / f"supabase-schema-replay-cli-{CLI_VERSION}"
    staging = Path(tempfile.mkdtemp(prefix=".supabase-schema-cli-staging-", dir=runner_temp))
    destination_created = False
    try:
        try:
            archive = tarfile.open(archive_path, mode="r:gz")
        except (OSError, tarfile.TarError) as error:
            raise InstallError("The verified release archive is not a readable gzip tarball.") from error
        with archive:
            matches = [member for member in archive.getmembers() if member.name == "supabase"]
            if len(matches) != 1:
                raise InstallError("The release must contain exactly one root `supabase` file.")
            member = matches[0]
            if not member.isfile() or member.issparse():
                raise InstallError("The root `supabase` archive member must be a regular file.")
            if member.size <= 0 or member.size > max_bytes:
                raise InstallError("The pinned Supabase CLI binary has an invalid size.")
            source = archive.extractfile(member)
            if source is None:
                raise InstallError("The root Supabase CLI binary could not be read.")
            binary = staging / "supabase"
            copied = 0
            try:
                with source, binary.open("xb") as target:
                    while chunk := source.read(1024 * 1024):
                        copied += len(chunk)
                        if copied > max_bytes:
                            raise InstallError("The Supabase CLI binary exceeds the size limit.")
                        target.write(chunk)
            except OSError as error:
                raise InstallError("The verified CLI binary could not be staged safely.") from error
            if copied != member.size:
                raise InstallError("The extracted CLI size differs from its archive header.")
            binary.chmod(0o755)

        try:
            destination.mkdir(mode=0o755)
        except FileExistsError as error:
            raise InstallError("The schema replay CLI destination already exists; refusing overwrite.") from error
        destination_created = True
        os.link(staging / "supabase", destination / "supabase")
    except OSError as error:
        if destination_created:
            shutil.rmtree(destination, ignore_errors=True)
        raise InstallError("The verified schema replay CLI could not be published into RUNNER_TEMP.") from error
    except BaseException:
        if destination_created:
            shutil.rmtree(destination, ignore_errors=True)
        raise
    finally:
        shutil.rmtree(staging, ignore_errors=True)

    return destination / "supabase"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path, help="Downloaded Supabase CLI release archive")
    args = parser.parse_args()
    runner_temp_value = os.environ.get("RUNNER_TEMP")
    if not runner_temp_value:
        parser.error("RUNNER_TEMP is required; this installer is for disposable CI runners only.")
    if platform.system() != "Linux" or platform.machine().lower() not in {"x86_64", "amd64"}:
        parser.error("Only the pinned Linux x64 Supabase CLI artifact is supported.")
    try:
        installed = install_cli(args.archive, Path(runner_temp_value))
    except InstallError as error:
        print(f"Schema replay Supabase CLI installation refused: {error}", file=sys.stderr)
        return 1
    print(f"Installed verified Supabase CLI {CLI_VERSION} at {installed}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
