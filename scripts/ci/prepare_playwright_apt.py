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


def rewrite_mirror_list(content: str) -> str:
    # APT mirror+file entries keep URLs in a separate file, without a deb/URIs
    # prefix. Only replace an exact Ubuntu Azure URL at the start of an entry.
    return "".join(
        AZURE_ARCHIVE.sub("https://archive.ubuntu.com/ubuntu", line, count=1)
        if AZURE_ARCHIVE.match(line.lstrip()) else line
        for line in content.splitlines(keepends=True)
    )


def main() -> None:
    if os.environ.get("GITHUB_ACTIONS") != "true":
        raise SystemExit("Only disposable GitHub Actions runners are supported")
    sources = [Path("/etc/apt/sources.list")]
    sources.extend(sorted(Path("/etc/apt/sources.list.d").glob("*.list")))
    sources.extend(sorted(Path("/etc/apt/sources.list.d").glob("*.sources")))
    for path in sources:
        if not path.is_file():
            continue
        original = path.read_text()
        updated = rewrite_sources(original)
        if updated != original:
            path.write_text(updated)
            print(f"Using primary Ubuntu archive in {path.name}; signing settings preserved")

    mirror_path = Path("/etc/apt/apt-mirrors.txt")
    if mirror_path.is_file():
        original = mirror_path.read_text()
        updated = rewrite_mirror_list(original)
        if updated != original:
            mirror_path.write_text(updated)
            print("Using primary Ubuntu archive in apt-mirrors.txt; source settings preserved")


if __name__ == "__main__":
    main()
