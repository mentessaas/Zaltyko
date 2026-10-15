#!/usr/bin/env python3
"""Mock-local safety tests for the pinned Supabase CLI tar installer."""

from __future__ import annotations

from hashlib import sha256
from io import BytesIO
from pathlib import Path
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import install_pinned_supabase_cli as installer  # noqa: E402


class PinnedSupabaseCliInstallerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory(prefix="zaltyko-cli-installer-test-")
        self.root = Path(self.temporary.name)
        self.archive = self.root / "fixture.tar.gz"
        self.destination = self.root / "installed-cli"
        self.payload = b"synthetic supabase cli binary fixture"

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def write_archive(self, entries: list[tuple[tarfile.TarInfo, bytes | None]]) -> None:
        with tarfile.open(self.archive, mode="w:gz") as archive:
            for member, content in entries:
                archive.addfile(member, BytesIO(content) if content is not None else None)

    def regular_member(self, name: str = "supabase") -> tarfile.TarInfo:
        member = tarfile.TarInfo(name)
        member.size = len(self.payload)
        member.mode = 0o644
        return member

    def install_with_fixture_pins(self) -> Path:
        with (
            patch.object(
                installer,
                "ARCHIVE_SHA256",
                sha256(self.archive.read_bytes()).hexdigest(),
            ),
            patch.object(installer, "BINARY_SHA256", sha256(self.payload).hexdigest()),
            patch.object(installer, "BINARY_SIZE", len(self.payload)),
        ):
            return installer.extract_verified_cli(self.archive, self.destination)

    def test_embedded_pins_match_reviewed_release_artifact(self) -> None:
        self.assertEqual(
            installer.ARCHIVE_SHA256,
            "620a5f6ea7b60f9b4fe112a5d72464ea0e53d04022035641674a2e6d121e0eb5",
        )
        self.assertEqual(
            installer.BINARY_SHA256,
            "3132b218461bf90d4cd5983b27b44031cd9b6c797c259a431b2e2520b5f7bdce",
        )
        self.assertEqual(installer.BINARY_SIZE, 94_924_984)

    def test_extracts_only_verified_regular_binary(self) -> None:
        self.write_archive([(self.regular_member(), self.payload)])

        binary = self.install_with_fixture_pins()

        self.assertEqual(binary.read_bytes(), self.payload)
        self.assertTrue(binary.stat().st_mode & 0o100)

    def test_rejects_wrong_archive_digest_before_opening_tar(self) -> None:
        self.archive.write_bytes(b"not the pinned archive")

        with self.assertRaisesRegex(ValueError, "archive SHA-256 mismatch"):
            installer.extract_verified_cli(self.archive, self.destination)
        self.assertFalse(self.destination.exists())

    def test_rejects_paths_links_and_extra_members(self) -> None:
        unsafe_members: list[list[tuple[tarfile.TarInfo, bytes | None]]] = [
            [(self.regular_member("../supabase"), self.payload)],
        ]
        link = tarfile.TarInfo("supabase")
        link.type = tarfile.SYMTYPE
        link.linkname = "../../outside"
        unsafe_members.append([(link, None)])
        unsafe_members.append(
            [(self.regular_member(), self.payload), (self.regular_member("extra"), self.payload)]
        )

        for entries in unsafe_members:
            with self.subTest(entries=[entry[0].name for entry in entries]):
                self.write_archive(entries)
                with patch.object(
                    installer,
                    "ARCHIVE_SHA256",
                    sha256(self.archive.read_bytes()).hexdigest(),
                ), patch.object(installer, "BINARY_SIZE", len(self.payload)):
                    with self.assertRaises(ValueError):
                        installer.extract_verified_cli(self.archive, self.destination)
                self.assertFalse(self.destination.exists())

    def test_rejects_binary_digest_mismatch_and_removes_partial_install(self) -> None:
        self.write_archive([(self.regular_member(), self.payload)])

        with (
            patch.object(
                installer,
                "ARCHIVE_SHA256",
                sha256(self.archive.read_bytes()).hexdigest(),
            ),
            patch.object(installer, "BINARY_SHA256", "0" * 64),
            patch.object(installer, "BINARY_SIZE", len(self.payload)),
        ):
            with self.assertRaisesRegex(ValueError, "binary SHA-256 mismatch"):
                installer.extract_verified_cli(self.archive, self.destination)
        self.assertFalse(self.destination.exists())


if __name__ == "__main__":
    unittest.main()
