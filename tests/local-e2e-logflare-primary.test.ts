import { describe, expect, it, vi } from "vitest";
import { pullPinnedImageWithDigestFallback } from "../scripts/lib/local-e2e-digest-fallback";
import { LOCAL_E2E_DIGEST_PINS } from "../scripts/lib/local-e2e-digest-pins";
import { EXCLUDED_LOCAL_SUPABASE_IMAGES } from "../scripts/lib/local-e2e-preflight";

const exact = "public.ecr.aws/supabase/logflare:1.34.14";
const pin = LOCAL_E2E_DIGEST_PINS.find((p) => p.ecr === exact)!;
const hub = `docker.io/${pin.hub}@${pin.manifest}`;
const identity = {
  Os: "linux",
  Architecture: "amd64",
  Id: pin.config,
  RepoDigests: [`${pin.hub}@${pin.manifest}`],
};
const ok = { status: 0, stdout: "", stderr: "" };
function harness(
  failAt = -1,
  status: number | null = 1,
  inspected: unknown = [identity]
) {
  return vi.fn(async (args: string[], _timeout: number) => {
    void _timeout;
    const index =
      args[0] === "pull"
        ? 0
        : args[1] === "tag"
          ? 2
          : args[2] === exact
            ? 3
            : 1;
    if (index === failAt)
      return {
        status,
        stdout: "secret-output",
        stderr: "429 timeout provider-secret",
      };
    return {
      ...ok,
      stdout: args[1] === "inspect" ? JSON.stringify(inspected) : "",
    };
  });
}
describe("exact logflare Hub primary, mocks only", () => {
  it.each([0, 1, 2, 3])(
    "rejects invalid statuses at stage %s",
    async (stage) => {
      for (const status of [null, NaN, Infinity, -1, 1.5]) {
        const run = harness(stage, status);
        await expect(
          pullPinnedImageWithDigestFallback(exact, run, () => 0)
        ).rejects.toHaveProperty("name", "DigestFallbackError");
        expect(run).toHaveBeenCalledTimes(stage + 1);
      }
    }
  );
  it.each(
    LOCAL_E2E_DIGEST_PINS.filter((p) =>
      EXCLUDED_LOCAL_SUPABASE_IMAGES.some((ref) => ref === p.ecr)
    )
  )("keeps exclusive quota authorization for $ecr", async (other) => {
    for (const [status, stderr] of [
      [1, "429 timeout"],
      [null, "429"],
      [NaN, "429"],
      [-1, "429"],
      [1.5, "429"],
    ] as const) {
      const run = vi.fn(async () => ({ status, stdout: "", stderr }));
      await expect(
        pullPinnedImageWithDigestFallback(other.ecr, run, () => 0)
      ).rejects.toMatchObject({ stage: "ecr-pull" });
      expect(run).toHaveBeenCalledTimes(1);
    }
  });
  it("uses exactly one digest pull then verify, ID retag and postverify", async () => {
    const run = harness();
    await pullPinnedImageWithDigestFallback(exact, run, () => 0);
    expect(run.mock.calls.map(([args]) => args)).toEqual([
      ["pull", "--platform", "linux/amd64", hub],
      ["image", "inspect", hub],
      ["image", "tag", pin.config, exact],
      ["image", "inspect", exact],
    ]);
    expect(run.mock.calls.every(([, timeout]) => timeout === 600_000)).toBe(
      true
    );
  });
  it.each([0, 1, 2, 3])(
    "stops at failed command %s without a second pull",
    async (stage) => {
      const run = harness(stage);
      const error = await pullPinnedImageWithDigestFallback(
        exact,
        run,
        () => 0
      ).catch((e) => e);
      expect(error.name).toBe("DigestFallbackError");
      expect(run).toHaveBeenCalledTimes(stage + 1);
      expect(
        run.mock.calls.filter(([args]) => args[0] === "pull")
      ).toHaveLength(1);
      expect(error.message).not.toMatch(/secret|fallback/i);
      if (stage === 0) expect(error.reason).toBe("hub-primary");
    }
  );
  it.each([null, NaN, Infinity, -1, 1.5])(
    "refuses invalid Hub status %s",
    async (status) => {
      const run = harness(0, status);
      await expect(
        pullPinnedImageWithDigestFallback(exact, run, () => 0)
      ).rejects.toMatchObject({ stage: "hub-pull", reason: "hub-primary" });
      expect(run).toHaveBeenCalledTimes(1);
    }
  );
  it.each(["timeout", "cancelled", "429", "provider-secret"])(
    "does not retry thrown %s",
    async (message) => {
      const run = vi.fn(async () => {
        throw new Error(message);
      });
      const error = await pullPinnedImageWithDigestFallback(
        exact,
        run,
        () => 0
      ).catch((e) => e);
      expect(error).toMatchObject({ stage: "hub-pull", reason: "command" });
      expect(error.message).not.toContain(message);
      expect(run).toHaveBeenCalledTimes(1);
    }
  );
  it.each([
    { ...identity, Os: "windows" },
    { ...identity, Architecture: "arm64" },
    { ...identity, Id: `sha256:${"0".repeat(64)}` },
    { ...identity, RepoDigests: [`evil/${pin.hub}@${pin.manifest}`] },
  ])("preserves platform/config/repository verification", async (changed) => {
    const run = harness(-1, 1, [changed]);
    await expect(
      pullPinnedImageWithDigestFallback(exact, run, () => 0)
    ).rejects.toMatchObject({ stage: "hub-inspect", reason: "identity" });
    expect(run).toHaveBeenCalledTimes(2);
  });
  it("rejects a post-retag identity mismatch", async () => {
    const base = harness();
    const run = vi.fn(async (args: string[], timeout: number) =>
      args[2] === exact && args[1] === "inspect"
        ? { ...ok, stdout: JSON.stringify([{ ...identity, Id: "wrong" }]) }
        : base(args, timeout)
    );
    await expect(
      pullPinnedImageWithDigestFallback(exact, run, () => 0)
    ).rejects.toMatchObject({ stage: "ecr-inspect", reason: "identity" });
    expect(run).toHaveBeenCalledTimes(4);
  });
  it.each([
    exact + "evil",
    exact + " ",
    exact + "\n",
    exact.replace(":1.34.14", ":latest"),
    "evil/" + exact,
  ])("rejects near reference %s before Docker", async (ref) => {
    const run = harness();
    await expect(
      pullPinnedImageWithDigestFallback(ref, run)
    ).rejects.toMatchObject({ stage: "pin" });
    expect(run).not.toHaveBeenCalled();
  });
  it.each(
    LOCAL_E2E_DIGEST_PINS.filter((p) =>
      EXCLUDED_LOCAL_SUPABASE_IMAGES.some((ref) => ref === p.ecr)
    )
  )("preserves primary ECR for $ecr", async (other) => {
    const run = vi.fn(async () => ok);
    await pullPinnedImageWithDigestFallback(other.ecr, run, () => 0);
    expect(run.mock.calls).toHaveLength(1);
    expect(run).toHaveBeenCalledWith(
      ["pull", "--platform", "linux/amd64", other.ecr],
      600_000
    );
  });
  it("shares the existing 600s across the Hub path", async () => {
    let time = 0;
    const base = harness();
    const run = vi.fn(async (args: string[], timeout: number) => {
      const result = await base(args, timeout);
      time += 200_000;
      return result;
    });
    await expect(
      pullPinnedImageWithDigestFallback(exact, run, () => time)
    ).rejects.toMatchObject({ reason: "clock" });
    expect(run.mock.calls.map(([, timeout]) => timeout)).toEqual([
      600_000, 400_000, 200_000,
    ]);
    expect(run).toHaveBeenCalledTimes(3);
  });
  it.each([NaN, Infinity, -1])(
    "refuses invalid/regressing clock %s before pull",
    async (value) => {
      const run = harness();
      const times = [0, value];
      await expect(
        pullPinnedImageWithDigestFallback(exact, run, () => times.shift()!)
      ).rejects.toMatchObject({ reason: "clock" });
      expect(run).not.toHaveBeenCalled();
    }
  );
});
