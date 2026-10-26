#!/usr/bin/env python3
"""Use Ubuntu's primary signed archive in disposable GitHub Linux runners."""

import os
import re
from pathlib import Path


AZURE_ARCHIVE = re.compile(
    r"https?://azure\.archive\.ubuntu\.com/ubuntu(?=[/\s]|$)"
)


def rewrite_sources(content: str) -> str:
    lines = []
    for line in content.splitlines(keepends=True):
        if line.lstrip().startswith(("URIs:", "deb ", "deb-src ")):
            line = AZURE_ARCHIVE.sub("https://archive.ubuntu.com/ubuntu", line)
        lines.append(line)
    return "".join(lines)


def main() -> None:
    if os.environ.get("GITHUB_ACTIONS") != "true":
        raise SystemExit("Only disposable GitHub Actions runners are supported")
    for path in (Path("/etc/apt/sources.list"), Path("/etc/apt/sources.list.d/ubuntu.sources")):
        if not path.is_file():
            continue
        original = path.read_text()
        updated = rewrite_sources(original)
        if updated != original:
            path.write_text(updated)
            print(f"Using primary Ubuntu archive in {path.name}; signing settings preserved")


if __name__ == "__main__":
    main()
