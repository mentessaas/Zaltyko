import importlib.util
import signal
import subprocess
import unittest
from pathlib import Path
from unittest.mock import Mock


SCRIPT = (
    Path(__file__).resolve().parents[1]
    / "scripts"
    / "run-zaltyko-verifier-with-deadline.py"
)
SPEC = importlib.util.spec_from_file_location("verifier_deadline", SCRIPT)
assert SPEC and SPEC.loader
verifier_deadline = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(verifier_deadline)


class VerifierDeadlineTests(unittest.TestCase):
    def test_success_returns_child_status_and_isolates_its_process_group(self):
        process = Mock(pid=31415)
        process.wait.return_value = 7
        popen = Mock(return_value=process)
        killpg = Mock()

        result = verifier_deadline.run_bounded(
            ["tsx", "verify.ts"], popen=popen, kill_process_group=killpg
        )

        self.assertEqual(result, 7)
        popen.assert_called_once_with(
            ["tsx", "verify.ts"], start_new_session=True
        )
        process.wait.assert_called_once_with(timeout=8.0)
        killpg.assert_not_called()

    def test_timeout_terminates_only_the_child_group_and_escalates_if_present(self):
        process = Mock(pid=27182)
        process.wait.side_effect = [
            subprocess.TimeoutExpired(["tsx"], 8.0),
            subprocess.TimeoutExpired(["tsx"], 0.25),
            0,
            0,
        ]
        popen = Mock(return_value=process)
        killpg = Mock()

        result = verifier_deadline.run_bounded(
            ["tsx", "verify.ts"], popen=popen, kill_process_group=killpg
        )

        self.assertEqual(result, 124)
        popen.assert_called_once_with(
            ["tsx", "verify.ts"], start_new_session=True
        )
        self.assertEqual(
            killpg.call_args_list,
            [
                unittest.mock.call(27182, signal.SIGTERM),
                unittest.mock.call(27182, signal.SIGKILL),
            ],
        )
        self.assertEqual(process.wait.call_count, 4)

    def test_timeout_does_not_signal_a_group_that_has_already_exited(self):
        process = Mock(pid=16180)
        process.wait.side_effect = [
            subprocess.TimeoutExpired(["tsx"], 8.0),
            0,
            0,
        ]
        popen = Mock(return_value=process)
        killpg = Mock(side_effect=[None, None, None])

        result = verifier_deadline.run_bounded(
            ["tsx", "verify.ts"], popen=popen, kill_process_group=killpg
        )

        self.assertEqual(result, 124)
        self.assertEqual(
            killpg.call_args_list,
            [
                unittest.mock.call(16180, signal.SIGTERM),
                unittest.mock.call(16180, 0),
                unittest.mock.call(16180, signal.SIGKILL),
            ],
        )


if __name__ == "__main__":
    unittest.main()
