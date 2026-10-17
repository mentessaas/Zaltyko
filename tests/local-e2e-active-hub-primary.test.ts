import { describe, expect, it, vi } from "vitest";
import { pullPinnedImageWithDigestFallback } from "../scripts/lib/local-e2e-digest-fallback";
import { LOCAL_E2E_DIGEST_PINS } from "../scripts/lib/local-e2e-digest-pins";
import {
  ACTIVE_LOCAL_SUPABASE_IMAGES,
  EXCLUDED_LOCAL_SUPABASE_IMAGES,
  REQUIRED_LOCAL_SUPABASE_IMAGES,
} from "../scripts/lib/local-e2e-preflight";

type Pin = (typeof LOCAL_E2E_DIGEST_PINS)[number];
const activePins = ACTIVE_LOCAL_SUPABASE_IMAGES.map((ref) => {
  const pin = LOCAL_E2E_DIGEST_PINS.find((candidate) => candidate.ecr === ref);
  if (!pin) throw new Error(`Missing fixture pin for ${ref}`);
  return pin;
});
const excludedRefs = new Set<string>(EXCLUDED_LOCAL_SUPABASE_IMAGES);
const excludedPins = LOCAL_E2E_DIGEST_PINS.filter((pin) =>
  excludedRefs.has(pin.ecr)
);
const digestRef = (pin: Pin) => `docker.io/${pin.hub}@${pin.manifest}`;
const identity = (pin: Pin, overrides: Record<string, unknown> = {}) => ({
  Os: "linux",
  Architecture: "amd64",
  Id: pin.config,
  RepoDigests: [`${pin.hub}@${pin.manifest}`],
  ...overrides,
});
const ok = { status: 0, stdout: "", stderr: "" };

function commandStage(pin: Pin, args: string[]): number {
  if (args[0] === "pull") return 0;
  if (args[1] === "tag") return 2;
  if (args[1] === "inspect" && args[2] === pin.ecr) return 3;
  return 1;
}

function docker(
  pin: Pin,
  options: {
    failStage?: number;
    status?: number | null;
    inspected?: unknown;
  } = {}
) {
  return vi.fn(async (args: string[], _timeout: number) => {
    void _timeout;
    const stage = commandStage(pin, args);
    if (stage === options.failStage) {
      return {
        status: options.status === undefined ? 1 : options.status,
        stdout: "sensitive-output",
        stderr: "429 timeout provider-secret",
      };
    }
    return {
      ...ok,
      stdout:
        args[1] === "inspect"
          ? JSON.stringify(options.inspected ?? [identity(pin)])
          : "",
    };
  });
}

describe("Hub primary for exact active image plan", () => {
  it("matches the fixed active plan to 11 catalog pins and excludes only Studio/meta", () => {
    expect(LOCAL_E2E_DIGEST_PINS).toHaveLength(13);
    expect(REQUIRED_LOCAL_SUPABASE_IMAGES).toHaveLength(13);
    expect(ACTIVE_LOCAL_SUPABASE_IMAGES).toHaveLength(11);
    expect(activePins.map((pin) => pin.ecr)).toEqual(
      ACTIVE_LOCAL_SUPABASE_IMAGES
    );
    expect(excludedPins.map((pin) => pin.ecr)).toEqual(
      EXCLUDED_LOCAL_SUPABASE_IMAGES
    );
    expect(
      new Set([
        ...ACTIVE_LOCAL_SUPABASE_IMAGES,
        ...EXCLUDED_LOCAL_SUPABASE_IMAGES,
      ])
    ).toEqual(new Set(REQUIRED_LOCAL_SUPABASE_IMAGES));
  });

  it.each(activePins)(
    "pulls $ecr from its exact Hub digest, verifies, retags ID, and postverifies",
    async (pin) => {
      const run = docker(pin);
      await pullPinnedImageWithDigestFallback(pin.ecr, run, () => 0);
      expect(run.mock.calls.map(([args]) => args)).toEqual([
        ["pull", "--platform", "linux/amd64", digestRef(pin)],
        ["image", "inspect", digestRef(pin)],
        ["image", "tag", pin.config, pin.ecr],
        ["image", "inspect", pin.ecr],
      ]);
      expect(run.mock.calls.every(([, timeout]) => timeout === 600_000)).toBe(
        true
      );
      expect(
        run.mock.calls.some(
          ([args]) => args[0] === "pull" && args.includes(pin.ecr)
        )
      ).toBe(false);
    }
  );

  it.each(activePins)("stops at each failing stage for $ecr", async (pin) => {
    for (const stage of [0, 1, 2, 3]) {
      const run = docker(pin, { failStage: stage, status: 1 });
      await expect(
        pullPinnedImageWithDigestFallback(pin.ecr, run, () => 0)
      ).rejects.toHaveProperty("name", "DigestFallbackError");
      expect(run).toHaveBeenCalledTimes(stage + 1);
      expect(
        run.mock.calls.some(
          ([args]) => args[0] === "pull" && args.includes(pin.ecr)
        )
      ).toBe(false);
    }
  });

  it.each(activePins)(
    "rejects invalid exit statuses without later commands for $ecr",
    async (pin) => {
      for (const stage of [0, 1, 2, 3]) {
        for (const status of [null, -1, 1.5, NaN, Infinity]) {
          const run = docker(pin, { failStage: stage, status });
          await expect(
            pullPinnedImageWithDigestFallback(pin.ecr, run, () => 0)
          ).rejects.toBeInstanceOf(Error);
          expect(run).toHaveBeenCalledTimes(stage + 1);
        }
      }
    }
  );

  it.each(activePins)(
    "does not retry or leak command errors for $ecr",
    async (pin) => {
      for (const [stage, expectedStage] of [
        [0, "hub-pull"],
        [1, "hub-inspect"],
        [2, "ecr-retag"],
        [3, "ecr-inspect"],
      ] as const) {
        const base = docker(pin);
        const run = vi.fn(async (args: string[], timeout: number) => {
          if (commandStage(pin, args) === stage)
            throw new Error("cancelled with provider-secret");
          return base(args, timeout);
        });
        const error = await pullPinnedImageWithDigestFallback(
          pin.ecr,
          run,
          () => 0
        ).catch((caught) => caught);
        expect(error).toMatchObject({
          stage: expectedStage,
          reason: "command",
        });
        expect(error.message).not.toMatch(
          /cancelled|provider-secret|fallback/i
        );
        expect(run).toHaveBeenCalledTimes(stage + 1);
      }
    }
  );

  it.each(activePins)(
    "enforces the shared 600s budget for $ecr",
    async (pin) => {
      let elapsed = 0;
      const base = docker(pin);
      const run = vi.fn(async (args: string[], timeout: number) => {
        const result = await base(args, timeout);
        elapsed += 200_000;
        return result;
      });
      await expect(
        pullPinnedImageWithDigestFallback(pin.ecr, run, () => elapsed)
      ).rejects.toMatchObject({
        reason: "clock",
      });
      expect(run.mock.calls.map(([, timeout]) => timeout)).toEqual([
        600_000, 400_000, 200_000,
      ]);
      expect(run).toHaveBeenCalledTimes(3);
    }
  );

  it.each(activePins)(
    "refuses an invalid or regressing clock before pull for $ecr",
    async (pin) => {
      for (const invalid of [NaN, Infinity, -1]) {
        const run = docker(pin);
        const times = [0, invalid];
        await expect(
          pullPinnedImageWithDigestFallback(pin.ecr, run, () => times.shift()!)
        ).rejects.toMatchObject({ stage: "hub-pull", reason: "clock" });
        expect(run).not.toHaveBeenCalled();
      }
    }
  );

  it("retains exact config, platform, and RepoDigest checks for Kong and other repositories", async () => {
    const kong = activePins.find((pin) => pin.hub === "library/kong")!;
    const postgrest = activePins.find(
      (pin) => pin.hub === "postgrest/postgrest"
    )!;
    for (const [pin, invalid] of [
      [
        kong,
        identity(kong, { RepoDigests: [`evil/${kong.hub}@${kong.manifest}`] }),
      ],
      [
        kong,
        identity(kong, { RepoDigests: [`kong@sha256:${"0".repeat(64)}`] }),
      ],
      [
        postgrest,
        identity(postgrest, {
          RepoDigests: [`other/${postgrest.hub}@${postgrest.manifest}`],
        }),
      ],
      [postgrest, identity(postgrest, { Id: `sha256:${"0".repeat(64)}` })],
      [postgrest, identity(postgrest, { Architecture: "arm64" })],
    ] as const) {
      const run = docker(pin, { inspected: [invalid] });
      await expect(
        pullPinnedImageWithDigestFallback(pin.ecr, run, () => 0)
      ).rejects.toMatchObject({
        stage: "hub-inspect",
        reason: "identity",
      });
      expect(run).toHaveBeenCalledTimes(2);
    }
  });

  it.each(excludedPins)(
    "keeps excluded pin $ecr on ECR primary when called directly",
    async (pin) => {
      const run = docker(pin);
      await pullPinnedImageWithDigestFallback(pin.ecr, run, () => 0);
      expect(run.mock.calls.map(([args]) => args)).toEqual([
        ["pull", "--platform", "linux/amd64", pin.ecr],
      ]);
    }
  );

  it.each(excludedPins)(
    "keeps exclusive positive-429 fallback for excluded pin $ecr",
    async (pin) => {
      const run = vi.fn(async (args: string[]) =>
        args[0] === "pull" && args.includes(pin.ecr)
          ? { status: 1, stdout: "", stderr: "toomanyrequests: 429" }
          : { ...ok, stdout: JSON.stringify([identity(pin)]) }
      );
      await pullPinnedImageWithDigestFallback(pin.ecr, run, () => 0);
      expect(run.mock.calls.map(([args]) => args)).toEqual([
        ["pull", "--platform", "linux/amd64", pin.ecr],
        ["pull", "--platform", "linux/amd64", digestRef(pin)],
        ["image", "inspect", digestRef(pin)],
        ["image", "tag", pin.config, pin.ecr],
        ["image", "inspect", pin.ecr],
      ]);
    }
  );

  it.each([
    "public.ecr.aws/supabase/imgproxy:v3.8.0evil",
    "public.ecr.aws/supabase/logflare:1.34.14 ",
    "public.ecr.aws/supabase/postgres:17.6.1.095\n",
    "public.ecr.aws/supabase/studio:2026.03.23-sha-b7847b7-extra",
  ])("rejects non-exact references before invoking Docker: %s", async (ref) => {
    const run = vi.fn();
    await expect(
      pullPinnedImageWithDigestFallback(ref, run)
    ).rejects.toMatchObject({ stage: "pin" });
    expect(run).not.toHaveBeenCalled();
  });
});
