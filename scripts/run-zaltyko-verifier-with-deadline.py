#!/usr/bin/env python3
"""Run one local verifier with a hard wall-clock limit, isolated from its shell."""

from __future__ import annotations

import os
import signal
import subprocess
import sys
from collections.abc import Callable, Sequence
from typing import Any

VERIFIER_DEADLINE_SECONDS = 8.0
TERMINATION_GRACE_SECONDS = 0.25


def run_bounded(
    command: Sequence[str],
    *,
    popen: Callable[..., Any] = subprocess.Popen,
    kill_process_group: Callable[[int, int], None] = os.killpg,
) -> int:
    """Bound only the verifier subprocess group; never signal the caller shell."""
    if not command:
        raise ValueError("Verifier command is required")

    process = popen(command, start_new_session=True)
    try:
        return process.wait(timeout=VERIFIER_DEADLINE_SECONDS)
    except subprocess.TimeoutExpired:
        try:
            kill_process_group(process.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass

        try:
            process.wait(timeout=TERMINATION_GRACE_SECONDS)
        except subprocess.TimeoutExpired:
            try:
                kill_process_group(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            process.wait()
        else:
            # The group leader may exit on SIGTERM while one of its
            # descendants remains alive. Check the isolated group itself.
            try:
                kill_process_group(process.pid, 0)
            except ProcessLookupError:
                pass
            else:
                try:
                    kill_process_group(process.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass

        process.wait()

        print(
            f"Verifier exceeded {VERIFIER_DEADLINE_SECONDS:g}s deadline; "
            "its process group was terminated",
            file=sys.stderr,
        )
        return 124


def main(arguments: Sequence[str]) -> int:
    if not arguments or arguments[0] != "--" or len(arguments) == 1:
        print("Usage: run-zaltyko-verifier-with-deadline.py -- COMMAND [ARGS...]", file=sys.stderr)
        return 2
    return run_bounded(arguments[1:])


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
