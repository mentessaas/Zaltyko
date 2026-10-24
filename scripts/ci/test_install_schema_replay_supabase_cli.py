#!/usr/bin/env python3
"""Synthetic archive tests for the isolated schema replay CLI installer."""

from __future__ import annotations

import hashlib
import io
import sys
import tarfile
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from install_schema_replay_supabase_cli import CLI_VERSION, InstallError, install_cli  # noqa: E402


def write_archive(path: Path, members: list[tuple[str, bytes | None, str]]) -> None:
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
                raise AssertionError(f"unsupported archive member kind: {kind}")


class SchemaReplayCliInstallerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.runner_temp = self.root / "runner-temp"
        self.runner_temp.mkdir()
        self.archive = self.root / "release.tar.gz"

    def tearDown(self) -> None:
        self.temp.cleanup()

    def digest(self) -> str:
        return hashlib.sha256(self.archive.read_bytes()).hexdigest()

    def test_installs_only_root_binary_after_verifying_archive(self) -> None:
        write_archive(self.archive, [("supabase", b"synthetic-cli", "file"), ("README", b"ignored", "file")])
        installed = install_cli(self.archive, self.runner_temp, self.digest())
        self.assertEqual(installed.read_bytes(), b"synthetic-cli")
        self.assertEqual(installed.parent.name, f"supabase-schema-replay-cli-{CLI_VERSION}")
        self.assertEqual(installed.stat().st_mode & 0o777, 0o755)
        self.assertEqual([path.name for path in installed.parent.iterdir()], ["supabase"])

    def test_rejects_archive_digest_before_extracting(self) -> None:
        self.archive.write_bytes(b"not the pinned release")
        with self.assertRaisesRegex(InstallError, "archive SHA-256"):
            install_cli(self.archive, self.runner_temp, "0" * 64)
        self.assertEqual(list(self.runner_temp.iterdir()), [])

    def test_rejects_symlink_and_duplicate_root_binary(self) -> None:
        write_archive(self.archive, [("supabase", None, "symlink")])
        with self.assertRaisesRegex(InstallError, "regular file"):
            install_cli(self.archive, self.runner_temp, self.digest())
        write_archive(self.archive, [("supabase", b"one", "file"), ("supabase", b"two", "file")])
        with self.assertRaisesRegex(InstallError, "exactly one"):
            install_cli(self.archive, self.runner_temp, self.digest())

    def test_refuses_overwrite_and_invalid_arguments(self) -> None:
        destination = self.runner_temp / f"supabase-schema-replay-cli-{CLI_VERSION}"
        destination.mkdir()
        sentinel = destination / "keep.txt"
        sentinel.write_text("preserved", encoding="utf-8")
        write_archive(self.archive, [("supabase", b"cli", "file")])
        with self.assertRaisesRegex(InstallError, "refusing overwrite"):
            install_cli(self.archive, self.runner_temp, self.digest())
        self.assertEqual(sentinel.read_text(encoding="utf-8"), "preserved")
        with self.assertRaisesRegex(InstallError, "lowercase SHA-256"):
            install_cli(self.archive, self.runner_temp, "not-a-digest")
        self.assertEqual([path.name for path in destination.iterdir()], ["keep.txt"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
