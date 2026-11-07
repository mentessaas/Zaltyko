#!/usr/bin/env python3
"""Synthetic, network-free tests for the pinned Supabase CLI installer."""

from __future__ import annotations

import hashlib
import io
import re
import sys
import tarfile
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from install_pinned_supabase_cli import (  # noqa: E402
    CLI_VERSION,
    EXPECTED_LINUX_X64_SHA256,
    InstallError,
    install_cli,
)


def write_archive(path: Path, members: list[tuple[str, bytes | None, str]]) -> None:
    """Write members as (name, bytes-or-None, kind) without extracting them."""
    with tarfile.open(path, mode="w:gz") as archive:
        for name, content, kind in members:
            info = tarfile.TarInfo(name)
            if kind == "file":
                assert content is not None
                info.size = len(content)
                archive.addfile(info, io.BytesIO(content))
            elif kind == "symlink":
                info.type = tarfile.SYMTYPE
                info.linkname = "../../outside"
                archive.addfile(info)
            else:
                raise AssertionError(f"unsupported test member kind: {kind}")


class PinnedSupabaseCliInstallerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.runner_temp = self.root / "runner-temp"
        self.runner_temp.mkdir()
        self.archive = self.root / "release.tar.gz"

    def tearDown(self) -> None:
        self.temp.cleanup()

    def test_installs_only_the_verified_root_binary(self) -> None:
        payload = b"synthetic-supabase-cli"
        write_archive(self.archive, [("supabase", payload, "file"), ("README.txt", b"ignored", "file")])

        installed = install_cli(
            self.archive,
            self.runner_temp,
            expected_sha256=hashlib.sha256(payload).hexdigest(),
        )

        self.assertEqual(installed.read_bytes(), payload)
        self.assertEqual(installed.parent.name, f"supabase-cli-{CLI_VERSION}")
        self.assertEqual(installed.stat().st_mode & 0o777, 0o755)
        self.assertEqual(sorted(path.name for path in installed.parent.iterdir()), ["supabase"])

    def test_does_not_extract_untrusted_paths_from_archive(self) -> None:
        payload = b"verified-binary"
        write_archive(
            self.archive,
            [("supabase", payload, "file"), ("../../outside", b"ignored", "file")],
        )

        installed = install_cli(
            self.archive,
            self.runner_temp,
            expected_sha256=hashlib.sha256(payload).hexdigest(),
        )

        self.assertEqual(installed.read_bytes(), payload)
        self.assertFalse((self.root / "outside").exists())

    def test_rejects_symlink_binary(self) -> None:
        write_archive(self.archive, [("supabase", None, "symlink")])

        with self.assertRaisesRegex(InstallError, "regular file"):
            install_cli(self.archive, self.runner_temp, expected_sha256="0" * 64)

    def test_rejects_duplicate_root_binary(self) -> None:
        write_archive(self.archive, [("supabase", b"first", "file"), ("supabase", b"second", "file")])

        with self.assertRaisesRegex(InstallError, "exactly one"):
            install_cli(self.archive, self.runner_temp, expected_sha256="0" * 64)

    def test_rejects_hash_mismatch_and_removes_staging_directory(self) -> None:
        write_archive(self.archive, [("supabase", b"wrong-binary", "file")])

        with self.assertRaisesRegex(InstallError, "SHA-256"):
            install_cli(self.archive, self.runner_temp, expected_sha256="0" * 64)

        self.assertEqual(list(self.runner_temp.iterdir()), [])

    def test_refuses_overwrite_of_existing_install(self) -> None:
        destination = self.runner_temp / "supabase-cli-2.84.2"
        destination.mkdir()
        sentinel = destination / "keep.txt"
        sentinel.write_text("existing install stays intact", encoding="utf-8")
        write_archive(self.archive, [("supabase", b"payload", "file")])

        with self.assertRaisesRegex(InstallError, "already exists"):
            install_cli(
                self.archive,
                self.runner_temp,
                expected_sha256=hashlib.sha256(b"payload").hexdigest(),
            )

        self.assertEqual(sentinel.read_text(encoding="utf-8"), "existing install stays intact")
        self.assertEqual(sorted(path.name for path in destination.iterdir()), ["keep.txt"])

    def test_rejects_invalid_digest_and_nonpositive_size_limit(self) -> None:
        write_archive(self.archive, [("supabase", b"payload", "file")])

        with self.assertRaisesRegex(InstallError, "lowercase SHA-256"):
            install_cli(self.archive, self.runner_temp, expected_sha256="not-a-digest")
        with self.assertRaisesRegex(InstallError, "size limit must be positive"):
            install_cli(
                self.archive,
                self.runner_temp,
                expected_sha256=hashlib.sha256(b"payload").hexdigest(),
                max_bytes=0,
            )
        self.assertEqual(list(self.runner_temp.iterdir()), [])

    def test_pinned_digest_matches_local_e2e_guard(self) -> None:
        source = Path(__file__).resolve().parents[1] / "lib" / "local-e2e-preflight.ts"
        content = source.read_text(encoding="utf-8")
        match = re.search(r'"linux-x64":\s*"([0-9a-f]{64})"', content)
        self.assertIsNotNone(match, "the local E2E guard must pin a Linux x64 CLI digest")
        self.assertEqual(match.group(1), EXPECTED_LINUX_X64_SHA256)


if __name__ == "__main__":
    unittest.main(verbosity=2)
