import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import type { ChildProcess } from "node:child_process";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  cleanupLocalProject,
  createTerminationHandler,
  LOCAL_E2E_TIMEOUTS,
  LocalCommandError,
  ProcessGroupCleanupError,
  runLocalCommand,
  terminateProcessGroup,
  type LocalSpawn,
} from "../scripts/lib/local-e2e-runner-core";
import {
  assertSupportedNodeVersion,
  findMissingImages,
  getSupportedSupabaseCliSha256,
  REQUIRED_LOCAL_SUPABASE_IMAGES,
  resolveExecutableOnPath,
  verifyInstalledRunnerPackages,
  verifySupabaseCliBinary,
} from "../scripts/lib/local-e2e-preflight";

function fakeChild(pid = 42) {
  const child = new EventEmitter() as EventEmitter & {
    pid: number;
    stdout: PassThrough;
    stderr: PassThrough;
    kill: ReturnType<typeof vi.fn>;
  };
  child.pid = pid;
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = vi.fn(() => true);
  return child;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("local E2E runner process safety", () => {
  it.each([0, 1])(
    "keeps command outcome %s when observation throws",
    async (status) => {
      const child = fakeChild();
      const observer = vi.fn(() => {
        throw new Error("private observer failure");
      });
      const promise = runLocalCommand(
        "next",
        ["build"],
        {
          cwd: "/tmp",
          env: {},
          timeoutMs: 240_000,
          onOutput: observer,
        },
        () => child as unknown as ChildProcess
      );
      const assertion =
        status === 0
          ? expect(promise).resolves.toMatchObject({
              status: 0,
              stdout: "safe\n",
            })
          : expect(promise).rejects.toBeInstanceOf(LocalCommandError);
      child.stdout.write("safe\n");
      child.stderr.write("stderr fixture\n");
      child.emit("close", status, null);
      await assertion;
      expect(observer).toHaveBeenCalledTimes(2);
    }
  );
  it("keeps finite setup, build, stop, and browser envelope limits", () => {
    expect(LOCAL_E2E_TIMEOUTS.setup).toBe(240_000);
    expect(LOCAL_E2E_TIMEOUTS.build).toBe(240_000);
    expect(LOCAL_E2E_TIMEOUTS.stop).toBe(120_000);
    expect(LOCAL_E2E_TIMEOUTS.browser).toBe(540_000);
    expect(Object.values(LOCAL_E2E_TIMEOUTS).every(Number.isFinite)).toBe(true);
  });

  it("captures a successful local command without package-manager invocation", async () => {
    const child = fakeChild();
    const spawnMock = vi.fn(
      () => child as unknown as ChildProcess
    ) as unknown as LocalSpawn;
    const promise = runLocalCommand(
      "node",
      ["local-fixture.js"],
      { cwd: "/tmp", env: {}, timeoutMs: 1_000 },
      spawnMock
    );

    child.stdout.write("ready\n");
    child.emit("close", 0, null);

    await expect(promise).resolves.toMatchObject({
      status: 0,
      stdout: "ready\n",
    });
    expect(spawnMock).toHaveBeenCalledWith(
      "node",
      ["local-fixture.js"],
      expect.objectContaining({ detached: process.platform !== "win32" })
    );
  });

  it("reports a non-zero command and its captured diagnostics", async () => {
    const child = fakeChild();
    const spawnMock = vi.fn(
      () => child as unknown as ChildProcess
    ) as unknown as LocalSpawn;
    const promise = runLocalCommand(
      "next",
      ["build"],
      { cwd: "/tmp", env: {}, timeoutMs: LOCAL_E2E_TIMEOUTS.build },
      spawnMock
    );
    child.stderr.write("local build failed\n");
    child.emit("close", 1, null);

    await expect(promise).rejects.toMatchObject({
      name: LocalCommandError.name,
      stderr: "local build failed\n",
    });
  });

  it("kills only its process group on SIGINT or SIGTERM and rejects the command", async () => {
    const child = fakeChild(73);
    const spawnMock = vi.fn(
      () => child as unknown as ChildProcess
    ) as unknown as LocalSpawn;
    const killGroup = vi.fn();
    const controller = new AbortController();
    const handleSignal = createTerminationHandler(controller, () => undefined);
    const promise = runLocalCommand(
      "playwright",
      ["test"],
      {
        cwd: "/tmp",
        env: {},
        timeoutMs: LOCAL_E2E_TIMEOUTS.browser,
        signal: controller.signal,
      },
      spawnMock,
      killGroup
    );

    handleSignal("SIGTERM");
    child.emit("close", null, "SIGTERM");

    await expect(promise).rejects.toThrow("interrupted by SIGTERM");
    expect(killGroup).toHaveBeenCalledWith(-73, "SIGTERM");
  });

  it("escalates a timed-out process group to SIGKILL", async () => {
    vi.useFakeTimers();
    const child = fakeChild(91);
    const spawnMock = vi.fn(
      () => child as unknown as ChildProcess
    ) as unknown as LocalSpawn;
    const killGroup = vi.fn();
    const promise = runLocalCommand(
      "supabase",
      ["start"],
      {
        cwd: "/tmp",
        env: {},
        timeoutMs: 10,
        onOutput: () => {
          throw new Error("observer");
        },
      },
      spawnMock,
      killGroup
    );

    child.stdout.write("Collecting build traces ...\n");
    await vi.advanceTimersByTimeAsync(10);
    expect(killGroup).toHaveBeenNthCalledWith(1, -91, "SIGTERM");
    await vi.advanceTimersByTimeAsync(LOCAL_E2E_TIMEOUTS.terminateGrace);
    expect(killGroup).toHaveBeenNthCalledWith(2, -91, "SIGKILL");
    child.emit("close", null, "SIGKILL");

    await expect(promise).rejects.toThrow("exceeded its 10 ms timeout");
  });

  it("keeps cleanup active when the leader closes before its descendant", async () => {
    vi.useFakeTimers();
    const child = fakeChild(92);
    const spawnMock = vi.fn(
      () => child as unknown as ChildProcess
    ) as unknown as LocalSpawn;
    let groupAlive = true;
    const killGroup = vi.fn((_pid: number, signal: NodeJS.Signals) => {
      if (signal === "SIGKILL") groupAlive = false;
    });
    const probeGroup = vi.fn(() => {
      if (!groupAlive)
        throw Object.assign(new Error("gone"), { code: "ESRCH" });
    });
    const promise = runLocalCommand(
      "node",
      ["leader-with-descendant.js"],
      { cwd: "/tmp", env: {}, timeoutMs: 10_000 },
      spawnMock,
      killGroup,
      probeGroup
    );

    child.emit("close", 0, null);
    expect(killGroup).toHaveBeenNthCalledWith(1, -92, "SIGTERM");
    await vi.advanceTimersByTimeAsync(LOCAL_E2E_TIMEOUTS.terminateGrace);

    await expect(promise).resolves.toMatchObject({ status: 0 });
    expect(killGroup).toHaveBeenNthCalledWith(2, -92, "SIGKILL");
    expect(probeGroup).toHaveBeenCalledTimes(3);
  });

  it("reports signal errors after killing the remaining group", async () => {
    vi.useFakeTimers();
    const child = fakeChild(93);
    const spawnMock = vi.fn(
      () => child as unknown as ChildProcess
    ) as unknown as LocalSpawn;
    let groupAlive = true;
    const killGroup = vi.fn((_pid: number, signal: NodeJS.Signals) => {
      if (signal === "SIGTERM") {
        throw Object.assign(new Error("permission denied"), { code: "EPERM" });
      }
      groupAlive = false;
    });
    const probeGroup = vi.fn(() => {
      if (!groupAlive)
        throw Object.assign(new Error("gone"), { code: "ESRCH" });
    });
    const promise = runLocalCommand(
      "supabase",
      ["start"],
      { cwd: "/tmp", env: {}, timeoutMs: 10 },
      spawnMock,
      killGroup,
      probeGroup
    );
    const rejection = expect(promise).rejects.toMatchObject({
      name: LocalCommandError.name,
      message: expect.stringContaining("signal error EPERM"),
    });

    await vi.advanceTimersByTimeAsync(10);
    child.emit("close", null, "SIGTERM");
    await vi.advanceTimersByTimeAsync(LOCAL_E2E_TIMEOUTS.terminateGrace);

    await rejection;
    expect(killGroup).toHaveBeenNthCalledWith(2, -93, "SIGKILL");
    expect(probeGroup).toHaveBeenCalled();
  });

  it("surfaces a cleanup error when SIGKILL cannot remove the process group", async () => {
    vi.useFakeTimers();
    const child = fakeChild(94);
    const spawnMock = vi.fn(
      () => child as unknown as ChildProcess
    ) as unknown as LocalSpawn;
    const killGroup = vi.fn();
    const probeGroup = vi.fn();
    const promise = runLocalCommand(
      "node",
      ["stuck-descendant.js"],
      { cwd: "/tmp", env: {}, timeoutMs: 10 },
      spawnMock,
      killGroup,
      probeGroup
    );
    const rejection = expect(promise).rejects.toBeInstanceOf(
      ProcessGroupCleanupError
    );

    await vi.advanceTimersByTimeAsync(10);
    child.emit("close", null, "SIGTERM");
    await vi.advanceTimersByTimeAsync(LOCAL_E2E_TIMEOUTS.terminateGrace);
    await vi.advanceTimersByTimeAsync(LOCAL_E2E_TIMEOUTS.terminateGrace);

    await rejection;
    expect(killGroup).toHaveBeenNthCalledWith(2, -94, "SIGKILL");
  });

  it("removes a successful project after stopping the exact stack", async () => {
    const stop = vi.fn().mockResolvedValue(undefined);
    const removeProject = vi.fn();
    const onStopError = vi.fn();

    const result = await cleanupLocalProject({
      startAttempted: true,
      stop,
      removeProject,
      onStopError,
    });

    expect(stop).toHaveBeenCalledOnce();
    expect(removeProject).toHaveBeenCalledOnce();
    expect(onStopError).not.toHaveBeenCalled();
    expect(result.preserveProjectDirectory).toBe(false);
  });

  it("preserves the project when stop fails and still cleans an unstarted project", async () => {
    const stopError = new Error("local stop failed");
    const stop = vi.fn().mockRejectedValue(stopError);
    const removeProject = vi.fn();
    const onStopError = vi.fn();

    const failedStop = await cleanupLocalProject({
      startAttempted: true,
      stop,
      removeProject,
      onStopError,
    });
    const unstarted = await cleanupLocalProject({
      startAttempted: false,
      stop,
      removeProject,
      onStopError,
    });

    expect(failedStop.preserveProjectDirectory).toBe(true);
    expect(onStopError).toHaveBeenCalledWith(stopError);
    expect(removeProject).toHaveBeenCalledOnce();
    expect(unstarted.preserveProjectDirectory).toBe(false);
    expect(stop).toHaveBeenCalledOnce();
  });

  it("preserves project files when a child process group may still exist", async () => {
    const removeProject = vi.fn();
    const result = await cleanupLocalProject({
      startAttempted: true,
      preserveProjectDirectory: true,
      stop: vi.fn().mockResolvedValue(undefined),
      removeProject,
      onStopError: vi.fn(),
    });

    expect(result.preserveProjectDirectory).toBe(true);
    expect(removeProject).not.toHaveBeenCalled();
  });

  it("uses negative process IDs to signal only the detached process group", () => {
    const killGroup = vi.fn();
    terminateProcessGroup(
      fakeChild(101) as unknown as ChildProcess,
      "SIGINT",
      killGroup
    );
    expect(killGroup).toHaveBeenCalledWith(-101, "SIGINT");
  });
});

describe("local E2E preflight", () => {
  it("accepts the supported Node versions", () => {
    expect(() => assertSupportedNodeVersion("22.22.3")).not.toThrow();
    expect(() => assertSupportedNodeVersion("20.19.0")).not.toThrow();
  });

  it("fails closed for unsupported Node or any missing image", () => {
    expect(() => assertSupportedNodeVersion("23.0.0")).toThrow(
      "Refusing to run"
    );
    expect(
      findMissingImages(REQUIRED_LOCAL_SUPABASE_IMAGES, [
        REQUIRED_LOCAL_SUPABASE_IMAGES[0],
      ])
    ).toHaveLength(REQUIRED_LOCAL_SUPABASE_IMAGES.length - 1);
  });

  it("matches the installed runner CLIs to the lockfile", () => {
    expect(() => verifyInstalledRunnerPackages(process.cwd())).not.toThrow();
  });

  it("uses only verified Supabase CLI platform hashes and rejects unknown targets", () => {
    expect(getSupportedSupabaseCliSha256("darwin", "arm64")).toBe(
      "c1c2bf3cac9cfb9679be798334821910f916d1cafe2cc5dc12d55443a15e920f"
    );
    expect(getSupportedSupabaseCliSha256("linux", "x64")).toBe(
      "3132b218461bf90d4cd5983b27b44031cd9b6c797c259a431b2e2520b5f7bdce"
    );
    expect(() => getSupportedSupabaseCliSha256("linux", "arm64")).toThrow(
      "No verified Supabase CLI"
    );

    const directory = mkdtempSync(join(tmpdir(), "zaltyko-runner-preflight-"));
    const binaryPath = join(directory, "supabase");
    const binary = Buffer.from("synthetic local Supabase CLI binary");
    writeFileSync(binaryPath, binary);
    try {
      expect(resolveExecutableOnPath("node", process.env.PATH)).toContain(
        "node"
      );
      expect(() => verifySupabaseCliBinary(binaryPath, "linux", "x64")).toThrow(
        "Refusing to start containers"
      );
      expect(() =>
        verifySupabaseCliBinary(binaryPath, "freebsd", "x64")
      ).toThrow("No verified Supabase CLI");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
