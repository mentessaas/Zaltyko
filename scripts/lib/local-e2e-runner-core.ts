import {
  spawn,
  type ChildProcess,
  type SpawnOptions,
} from "node:child_process";

export const LOCAL_E2E_TIMEOUTS = {
  preflight: 15_000,
  setup: 240_000,
  build: 240_000,
  stop: 120_000,
  // Existing Playwright webServer (240 s) plus the unchanged spec timeout (300 s).
  browser: 540_000,
  terminateGrace: 5_000,
} as const;

export type LocalSpawn = (
  command: string,
  args: string[],
  options: SpawnOptions
) => ChildProcess;

export type LocalGroupKill = (pid: number, signal: NodeJS.Signals) => void;
export type LocalGroupProbe = (pid: number) => void;

export function terminateProcessGroup(
  child: Pick<ChildProcess, "pid" | "kill">,
  signal: NodeJS.Signals,
  killGroup: LocalGroupKill = (pid, groupSignal) =>
    process.kill(pid, groupSignal)
): void {
  if (process.platform !== "win32" && child.pid) {
    try {
      killGroup(-child.pid, signal);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
    }
    return;
  }
  child.kill(signal);
}

export class LocalCommandError extends Error {
  constructor(
    message: string,
    readonly stdout: string,
    readonly stderr: string
  ) {
    super(message);
    this.name = "LocalCommandError";
  }
}

export class ProcessGroupCleanupError extends LocalCommandError {
  constructor(message: string, stdout: string, stderr: string) {
    super(message, stdout, stderr);
    this.name = "ProcessGroupCleanupError";
  }
}

function processGroupExists(
  child: Pick<ChildProcess, "pid">,
  probeGroup: LocalGroupProbe
): boolean {
  if (process.platform === "win32" || !child.pid) return false;
  try {
    probeGroup(-child.pid);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ESRCH") return false;
    if (code === "EPERM") return true;
    throw error;
  }
}

export function runLocalCommand(
  command: string,
  args: string[],
  options: {
    cwd: string;
    env: NodeJS.ProcessEnv;
    timeoutMs: number;
    signal?: AbortSignal;
    stdio?: "pipe" | "inherit";
    allowNonZero?: boolean;
    onOutput?: (stream: "stdout" | "stderr", chunk: Buffer | string) => void;
  },
  spawnChild: LocalSpawn = spawn,
  killGroup?: LocalGroupKill,
  probeGroup: LocalGroupProbe = (pid) => process.kill(pid, 0)
): Promise<{ status: number | null; stdout: string; stderr: string }> {
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) {
    return Promise.reject(
      new Error("Local command requires a finite timeout.")
    );
  }
  if (options.signal?.aborted) {
    return Promise.reject(new Error("Local command cancelled before start."));
  }

  return new Promise((resolve, reject) => {
    const child = spawnChild(command, args, {
      cwd: options.cwd,
      env: options.env,
      detached: process.platform !== "win32",
      stdio:
        options.stdio === "inherit" ? "inherit" : ["ignore", "pipe", "pipe"],
    });
    const chunks = { stdout: "", stderr: "" };
    let timedOut = false;
    let aborted = false;
    let settled = false;
    let terminationStarted = false;
    let escalated = false;
    let orphanCleanup = false;
    let terminationErrorCode: string | undefined;
    let escalation: NodeJS.Timeout | undefined;
    let groupPoll: NodeJS.Timeout | undefined;
    let groupDeadline: NodeJS.Timeout | undefined;
    let closeResult:
      { status: number | null; signal: NodeJS.Signals | null } | undefined;

    const append = (key: "stdout" | "stderr", chunk: Buffer | string) => {
      try {
        options.onOutput?.(key, chunk);
      } catch {
        /* Observation cannot change command lifecycle. */
      }
      if (options.stdio === "inherit") return;
      chunks[key] = `${chunks[key]}${chunk.toString()}`.slice(
        -20 * 1024 * 1024
      );
    };
    child.stdout?.on("data", (chunk: Buffer | string) =>
      append("stdout", chunk)
    );
    child.stderr?.on("data", (chunk: Buffer | string) =>
      append("stderr", chunk)
    );

    const clearTimers = () => {
      clearTimeout(timeout);
      if (escalation) clearTimeout(escalation);
      if (groupPoll) clearTimeout(groupPoll);
      if (groupDeadline) clearTimeout(groupDeadline);
      options.signal?.removeEventListener("abort", onAbort);
    };
    const sendSignal = (signal: NodeJS.Signals) => {
      try {
        terminateProcessGroup(child, signal, killGroup);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== "ESRCH") terminationErrorCode ??= code ?? "unknown";
      }
    };
    const rejectOnce = (error: unknown) => {
      if (settled) return;
      settled = true;
      clearTimers();
      reject(error);
    };
    const settleAfterGroupExit = () => {
      if (settled || !closeResult) return;
      let alive: boolean;
      try {
        alive = processGroupExists(child, probeGroup);
      } catch (error) {
        terminationErrorCode ??=
          (error as NodeJS.ErrnoException).code ?? "probe-failed";
        alive = true;
      }
      if (alive) {
        if (escalated) {
          if (!groupPoll) {
            groupPoll = setTimeout(() => {
              groupPoll = undefined;
              settleAfterGroupExit();
            }, 100);
          }
        }
        return;
      }

      settled = true;
      clearTimers();
      const result = {
        status: closeResult.status,
        stdout: chunks.stdout,
        stderr: chunks.stderr,
      };
      if (timedOut) {
        reject(
          new LocalCommandError(
            `${command} exceeded its ${options.timeoutMs} ms timeout${terminationErrorCode ? ` (signal error ${terminationErrorCode})` : ""}.`,
            result.stdout,
            result.stderr
          )
        );
      } else if (aborted) {
        reject(
          new LocalCommandError(
            `${command} was interrupted by ${String(closeResult.signal ?? options.signal?.reason ?? "a signal")}${terminationErrorCode ? ` (signal error ${terminationErrorCode})` : ""}.`,
            result.stdout,
            result.stderr
          )
        );
      } else if (result.status !== 0 && !options.allowNonZero) {
        reject(
          new LocalCommandError(
            `Command exited with code ${result.status ?? "unknown"}.`,
            result.stdout,
            result.stderr
          )
        );
      } else {
        resolve(result);
      }
    };
    const startGroupDeadline = () => {
      if (groupDeadline) return;
      groupDeadline = setTimeout(() => {
        groupDeadline = undefined;
        if (settled) return;
        let alive: boolean;
        try {
          alive = processGroupExists(child, probeGroup);
        } catch (error) {
          terminationErrorCode ??=
            (error as NodeJS.ErrnoException).code ?? "probe-failed";
          alive = true;
        }
        if (alive) {
          settled = true;
          clearTimers();
          reject(
            new ProcessGroupCleanupError(
              `${command} process group remained after SIGKILL${terminationErrorCode ? ` (${terminationErrorCode})` : ""}.`,
              chunks.stdout,
              chunks.stderr
            )
          );
        } else if (closeResult) {
          settleAfterGroupExit();
        }
      }, LOCAL_E2E_TIMEOUTS.terminateGrace);
    };
    const startEscalation = () => {
      if (escalation) return;
      escalation = setTimeout(() => {
        escalated = true;
        sendSignal("SIGKILL");
        startGroupDeadline();
        settleAfterGroupExit();
      }, LOCAL_E2E_TIMEOUTS.terminateGrace);
    };
    const beginTermination = (signal: NodeJS.Signals) => {
      if (terminationStarted) return;
      terminationStarted = true;
      sendSignal(signal);
      startEscalation();
    };
    const onAbort = () => {
      aborted = true;
      const signal =
        options.signal?.reason === "SIGTERM" ? "SIGTERM" : "SIGINT";
      beginTermination(signal);
    };

    const timeout = setTimeout(() => {
      timedOut = true;
      beginTermination("SIGTERM");
    }, options.timeoutMs);
    options.signal?.addEventListener("abort", onAbort, { once: true });

    child.once("error", rejectOnce);
    child.once("close", (status, signal) => {
      if (settled) return;
      closeResult = { status, signal };
      if (!terminationStarted) {
        let hasDescendants: boolean;
        try {
          hasDescendants = processGroupExists(child, probeGroup);
        } catch (error) {
          terminationErrorCode =
            (error as NodeJS.ErrnoException).code ?? "probe-failed";
          hasDescendants = true;
        }
        if (hasDescendants) {
          orphanCleanup = true;
          beginTermination("SIGTERM");
        }
      }
      if (orphanCleanup) terminationStarted = true;
      settleAfterGroupExit();
    });
  });
}

export async function cleanupLocalProject(input: {
  startAttempted: boolean;
  preserveProjectDirectory?: boolean;
  stop: () => Promise<void>;
  removeProject: () => void;
  onStopError: (error: unknown) => void;
}): Promise<{ preserveProjectDirectory: boolean }> {
  let preserveProjectDirectory = input.preserveProjectDirectory ?? false;
  if (input.startAttempted) {
    try {
      await input.stop();
    } catch (error) {
      preserveProjectDirectory = true;
      input.onStopError(error);
    }
  }
  if (!preserveProjectDirectory) input.removeProject();
  return { preserveProjectDirectory };
}

export function createTerminationHandler(
  controller: AbortController,
  terminateActiveProcess: (signal: NodeJS.Signals) => void
) {
  return (signal: NodeJS.Signals) => {
    if (!controller.signal.aborted) controller.abort(signal);
    terminateActiveProcess(signal);
  };
}
