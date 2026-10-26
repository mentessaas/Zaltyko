"""Network-free CI checks for the narrowly scoped APT source change."""

import unittest

from prepare_playwright_apt import rewrite_sources


class PlaywrightAptTests(unittest.TestCase):
    def test_deb822_preserves_signing_suites_components_and_security(self):
        original = (
            "Types: deb\nURIs: http://azure.archive.ubuntu.com/ubuntu/\n"
            "Suites: noble noble-updates noble-backports\n"
            "Components: main restricted universe multiverse\n"
            "Signed-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg\n\n"
            "Types: deb\nURIs: http://security.ubuntu.com/ubuntu/\n"
            "Suites: noble-security\n"
        )
        result = rewrite_sources(original)
        self.assertEqual(
            result,
            original.replace("http://azure.archive.ubuntu.com/ubuntu/", "https://archive.ubuntu.com/ubuntu/"),
        )
        self.assertEqual(rewrite_sources(result), result)

    def test_legacy_sources_preserve_signature_options_and_comments(self):
        original = (
            "# http://azure.archive.ubuntu.com/ubuntu/ is the previous mirror\n"
            "deb [signed-by=/keyring.gpg] https://azure.archive.ubuntu.com/ubuntu noble main\n"
        )
        self.assertEqual(
            rewrite_sources(original),
            original.replace("https://azure.archive.ubuntu.com/ubuntu noble", "https://archive.ubuntu.com/ubuntu noble"),
        )

    def test_unrelated_and_lookalike_repositories_are_unchanged(self):
        for value in (
            "URIs: https://packages.microsoft.com/repos/code\n",
            "URIs: https://azure.archive.ubuntu.com.evil.test/ubuntu\n",
            "URIs: https://azure.archive.ubuntu.com/ubuntu-extra\n",
            "Signed-By: https://azure.archive.ubuntu.com/ubuntu/key\n",
        ):
            with self.subTest(value=value):
                self.assertEqual(rewrite_sources(value), value)


if __name__ == "__main__":
    unittest.main()
