import { describe, expect, it, vi } from "vitest";
import { pullPinnedImageWithDigestFallback } from "../scripts/lib/local-e2e-digest-fallback";
import { LOCAL_E2E_DIGEST_PINS } from "../scripts/lib/local-e2e-digest-pins";
import { ACTIVE_LOCAL_SUPABASE_IMAGES } from "../scripts/lib/local-e2e-preflight";
type Pin = (typeof LOCAL_E2E_DIGEST_PINS)[number];
function docker(
  pin: Pin,
  refs: unknown[],
  afterRefs = refs,
  afterConfig: string = pin.config
) {
  return vi.fn(async (args: string[], timeout: number) => {
    expect(timeout).toBeGreaterThan(0);
    expect(timeout).toBeLessThanOrEqual(600_000);
    if (args[0] === "pull" && args.includes(pin.ecr))
      return { status: 1, stdout: "", stderr: "429 toomanyrequests" };
    const after = args[2] === pin.ecr;
    return {
      status: 0,
      stderr: "",
      stdout:
        args[1] === "inspect"
          ? JSON.stringify([
              {
                Os: "linux",
                Architecture: "amd64",
                Id: after ? afterConfig : pin.config,
                RepoDigests: after ? afterRefs : refs,
              },
            ])
          : "",
    };
  });
}
const positives = LOCAL_E2E_DIGEST_PINS.flatMap((pin) => [
  { pin, representation: `${pin.hub}@${pin.manifest}` },
  { pin, representation: `docker.io/${pin.hub}@${pin.manifest}` },
  ...(pin.hub === "library/kong"
    ? [{ pin, representation: `kong@${pin.manifest}` }]
    : []),
]);
describe("exact pinned repository representations", () => {
  it.each(positives)(
    "accepts $representation before and after retag",
    async ({ pin, representation }) => {
      const run = docker(pin, [representation]);
      await pullPinnedImageWithDigestFallback(pin.ecr, run, () => 0);
      expect(run.mock.calls.map((c) => c[0])).toEqual([
        ...(ACTIVE_LOCAL_SUPABASE_IMAGES.includes(pin.ecr)
          ? []
          : [["pull", "--platform", "linux/amd64", pin.ecr]]),
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
      expect(run.mock.calls.every((c) => c[1] === 600_000)).toBe(true);
    }
  );
  const negatives = LOCAL_E2E_DIGEST_PINS.flatMap((pin) => {
    const ref = `${pin.hub}@${pin.manifest}`;
    return [
      `evil.example/${ref}`,
      `index.docker.io/${ref}`,
      `registry-1.docker.io/${ref}`,
      `docker.io.evil.example/${ref}`,
      `other/${ref}`,
      `${pin.hub}/sub@${pin.manifest}`,
      `${pin.hub}:latest@${pin.manifest}`,
      `${pin.hub}:2.8.1`,
      ` ${ref}`,
      `${ref} `,
      `${ref}\n`,
      `DOCKER.IO/${ref}`,
      `${pin.hub}@sha256:${"0".repeat(64)}`,
      `${ref}@${pin.manifest}`,
      `docker.io//${ref}`,
      `${pin.hub.split("/").at(-1)}@sha256:${"0".repeat(64)}`,
      ...(pin.hub === "library/kong"
        ? [
            `library/sub/kong@${pin.manifest}`,
            `other/kong@${pin.manifest}`,
            `docker.io/kong@${pin.manifest}`,
          ]
        : [`${pin.hub.split("/").at(-1)}@${pin.manifest}`]),
    ].map((representation) => ({ pin, representation }));
  });
  it.each(negatives)(
    "rejects nonmatching $representation without retag",
    async ({ pin, representation }) => {
      const run = docker(pin, [representation]);
      await expect(
        pullPinnedImageWithDigestFallback(pin.ecr, run, () => 0)
      ).rejects.toMatchObject({
        stage: "hub-inspect",
        identityChecks: {
          "repo-digest-match": false,
          "config-match": true,
          "os-match": true,
          "arch-match": true,
        },
      });
      expect(run.mock.calls.some((c) => c[0][1] === "tag")).toBe(false);
    }
  );
  it("does not substitute a matching repo digest for the config identity", async () => {
    const pin = LOCAL_E2E_DIGEST_PINS.find((p) => p.hub === "library/kong")!;
    const run = docker(
      pin,
      [`kong@${pin.manifest}`],
      [`kong@${pin.manifest}`],
      `sha256:${"0".repeat(64)}`
    );
    await expect(
      pullPinnedImageWithDigestFallback(pin.ecr, run, () => 0)
    ).rejects.toMatchObject({
      stage: "ecr-inspect",
      identityChecks: { "repo-digest-match": true, "config-match": false },
    });
  });
  it("rejects a repository mismatch introduced after a successful retag", async () => {
    const pin = LOCAL_E2E_DIGEST_PINS[0];
    const run = docker(
      pin,
      [`docker.io/${pin.hub}@${pin.manifest}`],
      [`evil/${pin.hub}@${pin.manifest}`]
    );
    await expect(
      pullPinnedImageWithDigestFallback(pin.ecr, run, () => 0)
    ).rejects.toMatchObject({
      stage: "ecr-inspect",
      identityChecks: { "repo-digest-match": false },
    });
    expect(run).toHaveBeenCalledTimes(
      ACTIVE_LOCAL_SUPABASE_IMAGES.includes(pin.ecr) ? 4 : 5
    );
  });
  it("does not coerce nonstring RepoDigest entries", async () => {
    const pin = LOCAL_E2E_DIGEST_PINS[0];
    const run = docker(pin, [null, 1, { value: `${pin.hub}@${pin.manifest}` }]);
    await expect(
      pullPinnedImageWithDigestFallback(pin.ecr, run, () => 0)
    ).rejects.toMatchObject({ identityChecks: { "repo-digest-match": false } });
  });
});
