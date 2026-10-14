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
  },
  spawnChild: LocalSpawn = spawn,
  killGroup?: LocalGroupKill
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
    let escalation: NodeJS.Timeout | undefined;

    const append = (key: "stdout" | "stderr", chunk: Buffer | string) => {
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
      options.signal?.removeEventListener("abort", onAbort);
    };
    const sendSignal = (signal: NodeJS.Signals) => {
      try {
        terminateProcessGroup(child, signal, killGroup);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ESRCH") {
          rejectOnce(error);
          return;
        }
      }
      escalation = setTimeout(
        () => terminateProcessGroup(child, "SIGKILL", killGroup),
        LOCAL_E2E_TIMEOUTS.terminateGrace
      );
    };
    const rejectOnce = (error: unknown) => {
      if (settled) return;
      settled = true;
      clearTimers();
      reject(error);
    };
    const onAbort = () => {
      aborted = true;
      const signal =
        options.signal?.reason === "SIGTERM" ? "SIGTERM" : "SIGINT";
      sendSignal(signal);
    };

    const timeout = setTimeout(() => {
      timedOut = true;
      sendSignal("SIGTERM");
    }, options.timeoutMs);
    options.signal?.addEventListener("abort", onAbort, { once: true });

    child.once("error", rejectOnce);
    child.once("close", (status, signal) => {
      if (settled) return;
      settled = true;
      clearTimers();
      const result = { status, stdout: chunks.stdout, stderr: chunks.stderr };
      if (timedOut) {
        reject(
          new LocalCommandError(
            `${command} exceeded its ${options.timeoutMs} ms timeout.`,
            result.stdout,
            result.stderr
          )
        );
      } else if (aborted) {
        reject(
          new LocalCommandError(
            `${command} was interrupted by ${String(signal ?? options.signal?.reason ?? "a signal")}.`,
            result.stdout,
            result.stderr
          )
        );
      } else {
        if (status !== 0 && !options.allowNonZero) {
          reject(
            new LocalCommandError(
              `Command exited with code ${status ?? "unknown"}.`,
              result.stdout,
              result.stderr
            )
          );
        } else {
          resolve(result);
        }
      }
    });
  });
}

export async function cleanupLocalProject(input: {
  startAttempted: boolean;
  stop: () => Promise<void>;
  removeProject: () => void;
  onStopError: (error: unknown) => void;
}): Promise<{ preserveProjectDirectory: boolean }> {
  let preserveProjectDirectory = false;
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
