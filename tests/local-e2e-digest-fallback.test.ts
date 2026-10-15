import { describe, expect, it, vi } from "vitest";
import { pullPinnedImageWithDigestFallback } from "../scripts/lib/local-e2e-digest-fallback";
import { LOCAL_E2E_DIGEST_PINS } from "../scripts/lib/local-e2e-digest-pins";
const pin = LOCAL_E2E_DIGEST_PINS[0];
const ok = { status: 0, stdout: "", stderr: "" };
const limited = {
  status: 1,
  stdout: "",
  stderr: "toomanyrequests: 429 secret-provider-value",
};
const identity = {
  Os: "linux",
  Architecture: "amd64",
  Id: pin.config,
  RepoDigests: [`${pin.hub}@${pin.manifest}`],
};
function harness(
  options: {
    primary?: typeof ok;
    hub?: typeof ok;
    inspected?: unknown;
    inspectStatus?: number;
    tagStatus?: number;
  } = {}
) {
  const run = vi.fn(async (args: string[], _timeout: number) => {
    if (args[0] === "pull")
      return args.includes(pin.ecr)
        ? (options.primary ?? limited)
        : (options.hub ?? ok);
    if (args[1] === "inspect")
      return {
        ...ok,
        status: options.inspectStatus ?? 0,
        stdout: JSON.stringify(options.inspected ?? [identity]),
      };
    return { ...ok, status: options.tagStatus ?? 0 };
  });
  return run;
}
describe("digest fallback, mocked Docker only", () => {
  it("pins all 13 distinct images and exact config/manifest digests", () => {
    expect(LOCAL_E2E_DIGEST_PINS).toHaveLength(13);
    expect(new Set(LOCAL_E2E_DIGEST_PINS.map((p) => p.ecr)).size).toBe(13);
    for (const p of LOCAL_E2E_DIGEST_PINS) {
      expect(p.manifest).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(p.config).toMatch(/^sha256:[a-f0-9]{64}$/);
    }
  });
  it("does not fallback after primary success", async () => {
    const run = harness({ primary: ok });
    await pullPinnedImageWithDigestFallback(pin.ecr, run);
    expect(run).toHaveBeenCalledTimes(1);
  });
  it.each([null, -1, 1.5, NaN, Infinity])(
    "refuses quota fallback for terminated or invalid exit status %s",
    async (status) => {
      const run = vi.fn(async () => ({ ...limited, status }));
      await expect(
        pullPinnedImageWithDigestFallback(pin.ecr, run)
      ).rejects.toMatchObject({ stage: "ecr-pull", reason: "primary" });
      expect(run).toHaveBeenCalledTimes(1);
    }
  );
  it("pulls Hub only by digest, verifies identity before retag by config ID", async () => {
    const run = harness();
    await pullPinnedImageWithDigestFallback(pin.ecr, run, () => 0);
    expect(run.mock.calls.map((c) => c[0])).toEqual([
      ["pull", "--platform", "linux/amd64", pin.ecr],
      [
        "pull",
        "--platform",
        "linux/amd64",
        `docker.io/${pin.hub}@${pin.manifest}`,
      ],
      ["image", "inspect", `docker.io/${pin.hub}@${pin.manifest}`],
      ["image", "tag", pin.config, pin.ecr],
      ["image", "inspect", pin.ecr],
    ]);
  });
  it.each([
    "unauthorized 401",
    "connection reset",
    "manifest unknown",
    "no space left on device",
    "deadline exceeded",
    "unknown failure",
    "429 unauthorized",
    "429 TLS handshake failed",
  ])("refuses other or mixed failure: %s", async (stderr) => {
    const run = harness({ primary: { ...limited, stderr } });
    await expect(
      pullPinnedImageWithDigestFallback(pin.ecr, run)
    ).rejects.toThrow("fallback refused");
    expect(run).toHaveBeenCalledTimes(1);
  });
  it.each([
    { ...identity, Architecture: "arm64" },
    { ...identity, Os: "windows" },
    { ...identity, Id: `sha256:${"0".repeat(64)}` },
    { ...identity, RepoDigests: [] },
    { ...identity, RepoDigests: [`${pin.hub}@sha256:${"0".repeat(64)}`] },
  ])("refuses mismatched platform/config/RepoDigests", async (changed) => {
    const run = harness({ inspected: [changed] });
    await expect(
      pullPinnedImageWithDigestFallback(pin.ecr, run)
    ).rejects.toThrow("identity verification failed");
    expect(run.mock.calls.some((c) => c[0][1] === "tag")).toBe(false);
  });
  it("fails closed on Hub quota without retry or leaking output", async () => {
    const run = harness({ hub: limited });
    await expect(
      pullPinnedImageWithDigestFallback(pin.ecr, run)
    ).rejects.toThrow("Docker Hub digest fallback failed; no retry permitted.");
    expect(run).toHaveBeenCalledTimes(2);
  });
  it("refuses unknown refs before invoking Docker", async () => {
    const run = harness();
    await expect(
      pullPinnedImageWithDigestFallback("unknown:latest", run)
    ).rejects.toThrow("No verified digest pin");
    expect(run).not.toHaveBeenCalled();
  });
  it("shares 600 seconds across commands rather than renewing the pull timeout", async () => {
    let time = 0;
    const base = harness();
    const run = vi.fn(async (args: string[], timeout: number) => {
      const result = await base(args, timeout);
      time += args.includes(pin.ecr) ? 400_000 : 200_000;
      return result;
    });
    await expect(
      pullPinnedImageWithDigestFallback(pin.ecr, run, () => time)
    ).rejects.toThrow("budget exhausted");
    expect(run.mock.calls.map((c) => c[1])).toEqual([600_000, 200_000]);
    expect(run).toHaveBeenCalledTimes(2);
  });
  it.each([
    { inspectStatus: 1 },
    { tagStatus: 1 },
    { inspected: {} },
    { inspected: [] },
  ])("fails closed on inspect/retag errors", async (options) => {
    await expect(
      pullPinnedImageWithDigestFallback(pin.ecr, harness(options))
    ).rejects.toThrow();
  });
  it("does not expose thrown Docker details or try an alternative", async () => {
    const run = vi.fn(async () => {
      throw new Error("secret-provider-value");
    });
    await expect(
      pullPinnedImageWithDigestFallback(pin.ecr, run)
    ).rejects.toThrow("Image Docker command failed; raw output omitted.");
    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe("typed safe failures and post-command clock guards", () => {
  it.each([NaN, Infinity, -1, 600_000])(
    "rejects invalid post-success clock %s before returning",
    async (time) => {
      let calls = 0;
      const run = harness({ primary: ok });
      await expect(
        pullPinnedImageWithDigestFallback(pin.ecr, run, () =>
          ++calls <= 2 ? 0 : time
        )
      ).rejects.toMatchObject({
        stage: "ecr-pull",
        status: 0,
        reason: "clock",
      });
      expect(run).toHaveBeenCalledTimes(1);
    }
  );
  it("rejects post-command clock regression from previous elapsed", async () => {
    const values = [0, 10, 9];
    await expect(
      pullPinnedImageWithDigestFallback(pin.ecr, harness({ primary: ok }), () =>
        values.shift()!
      )
    ).rejects.toMatchObject({ reason: "clock" });
  });
  it.each([
    "not-json",
    "null",
    "[null]",
    "[1]",
    "[{}]",
    "[{},{}]",
    '{"secret":"provider-value"}',
  ])("rejects malformed inspect %s without retag", async (stdout) => {
    const base = harness();
    const run = vi.fn(async (args: string[], timeout: number) =>
      args[1] === "inspect" ? { ...ok, stdout } : base(args, timeout)
    );
    await expect(
      pullPinnedImageWithDigestFallback(pin.ecr, run)
    ).rejects.toMatchObject({ stage: "hub-inspect", reason: "identity" });
    expect(run.mock.calls.some((c) => c[0][1] === "tag")).toBe(false);
  });
  it("rejects changed tagged identity even when retag reports success", async () => {
    const base = harness();
    const run = vi.fn(async (args: string[], timeout: number) =>
      args[1] === "inspect" && args[2] === pin.ecr
        ? {
            ...ok,
            stdout: JSON.stringify([
              { ...identity, Id: `sha256:${"0".repeat(64)}` },
            ]),
          }
        : base(args, timeout)
    );
    await expect(
      pullPinnedImageWithDigestFallback(pin.ecr, run)
    ).rejects.toMatchObject({
      stage: "ecr-inspect",
      status: 0,
      reason: "identity",
    });
    expect(run).toHaveBeenCalledTimes(5);
  });
  it.each([undefined, null, "provider-secret", new Error("provider-secret")])(
    "discards arbitrary thrown values without cause",
    async (thrown) => {
      const run = vi.fn(async () => {
        throw thrown;
      });
      const error = await pullPinnedImageWithDigestFallback(pin.ecr, run).catch(
        (e) => e
      );
      expect(error).toMatchObject({
        name: "DigestFallbackError",
        stage: "ecr-pull",
        status: null,
        flags: [],
        reason: "command",
      });
      expect(error.cause).toBeUndefined();
      expect(JSON.stringify(error)).not.toContain("provider-secret");
      expect(error.message).not.toContain("provider-secret");
      expect(run).toHaveBeenCalledTimes(1);
    }
  );
  it("preserves fixed status and diagnostic categories on primary failure", async () => {
    const run = harness({
      primary: {
        status: 17,
        stdout: "stdout-secret",
        stderr: "unauthorized 401 provider-secret",
      },
    });
    const error = await pullPinnedImageWithDigestFallback(pin.ecr, run).catch(
      (e) => e
    );
    expect(error).toMatchObject({
      stage: "ecr-pull",
      status: 17,
      flags: ["authentication-or-permission"],
    });
    expect(error.message).toContain("docker exit status 17");
    expect(error.message).toContain(
      "Diagnostic indicators: authentication-or-permission. Raw stderr omitted."
    );
    expect(error.cause).toBeUndefined();
    expect(error.message).not.toMatch(/stdout-secret|provider-secret/);
  });
});
