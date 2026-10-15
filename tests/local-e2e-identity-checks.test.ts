import { describe, expect, it, vi } from "vitest";
import { pullPinnedImageWithDigestFallback } from "../scripts/lib/local-e2e-digest-fallback";
import { LOCAL_E2E_DIGEST_PINS } from "../scripts/lib/local-e2e-digest-pins";
import {
  DigestFallbackError,
  IDENTITY_CHECK_NAMES,
  emptyIdentityChecks,
  type IdentityChecks,
} from "../scripts/lib/local-e2e-docker-diagnostics";
const kong = LOCAL_E2E_DIGEST_PINS.find((p) => p.hub === "library/kong")!;
const identity = {
  Os: "linux",
  Architecture: "amd64",
  Id: kong.config,
  RepoDigests: [`library/kong@${kong.manifest}`],
};
const ok = { status: 0, stdout: "", stderr: "" };
function mock(hubOutput: string, taggedOutput = hubOutput) {
  return vi.fn(async (args: string[]) => {
    if (args[0] === "pull" && args.includes(kong.ecr))
      return { ...ok, status: 1, stderr: "429 toomanyrequests" };
    if (args[1] === "inspect")
      return { ...ok, stdout: args[2] === kong.ecr ? taggedOutput : hubOutput };
    return ok;
  });
}
async function failure(output: string) {
  const run = mock(output);
  const error = await pullPinnedImageWithDigestFallback(
    kong.ecr,
    run,
    () => 0
  ).catch((e) => e);
  expect(error).toBeInstanceOf(DigestFallbackError);
  expect(error.stage).toBe("hub-inspect");
  expect(run.mock.calls.some((c) => c[0][1] === "tag")).toBe(false);
  return error as DigestFallbackError;
}
describe("closed identity diagnostics, Kong fixtures (not observed Docker output)", () => {
  it("accepts exact Kong config/platform/RepoDigest before and after retag", async () => {
    const run = mock(JSON.stringify([identity]));
    await pullPinnedImageWithDigestFallback(kong.ecr, run, () => 0);
    expect(run.mock.calls.map((c) => c[0])).toContainEqual([
      "image",
      "tag",
      kong.config,
      kong.ecr,
    ]);
    expect(run).toHaveBeenCalledTimes(5);
  });
  it("reports invalid JSON and leaves dependent checks unevaluated", async () => {
    const error = await failure("malformed-provider-secret");
    expect(error.identityChecks).toEqual({
      ...emptyIdentityChecks(),
      "json-valid": false,
    });
  });
  it.each(["null", "{}", "[]", "[null]", "[[]]", "[1]", "[{},{}]"])(
    "reports non-single-object shape %s",
    async (output) => {
      const error = await failure(output);
      expect(error.identityChecks).toEqual({
        ...emptyIdentityChecks(),
        "json-valid": true,
        "single-object": false,
      });
    }
  );
  it.each([
    ["os-match", { ...identity, Os: "windows" }],
    ["arch-match", { ...identity, Architecture: "arm64" }],
    ["config-match", { ...identity, Id: `sha256:${"0".repeat(64)}` }],
    [
      "repo-digest-match",
      { ...identity, RepoDigests: [`library/kong@sha256:${"0".repeat(64)}`] },
    ],
  ] as const)(
    "isolates mismatch %s while preserving remaining checks",
    async (key, changed) => {
      const error = await failure(JSON.stringify([changed]));
      expect(error.identityChecks).toEqual(
        Object.fromEntries(
          IDENTITY_CHECK_NAMES.map((name) => [
            name,
            name === key ? false : true,
          ])
        )
      );
    }
  );
  it("accepts the exact familiar Kong representation without changing identity", async () => {
    const run = mock(
      JSON.stringify([{ ...identity, RepoDigests: [`kong@${kong.manifest}`] }])
    );
    await pullPinnedImageWithDigestFallback(kong.ecr, run, () => 0);
    expect(run.mock.calls.map((c) => c[0])).toContainEqual([
      "image",
      "tag",
      kong.config,
      kong.ecr,
    ]);
    expect(run).toHaveBeenCalledTimes(5);
  });
  it("reports all independent mismatches without short circuit", async () => {
    const error = await failure(
      JSON.stringify([
        { Os: "bad", Architecture: "bad", Id: "bad", RepoDigests: null },
      ])
    );
    expect(error.identityChecks).toEqual({
      "json-valid": true,
      "single-object": true,
      "os-match": false,
      "arch-match": false,
      "config-match": false,
      "repo-digest-match": false,
    });
  });
  it("rejects changed identity after successful retag with stage-specific checks", async () => {
    const run = mock(
      JSON.stringify([identity]),
      JSON.stringify([{ ...identity, Id: "changed" }])
    );
    const error = await pullPinnedImageWithDigestFallback(
      kong.ecr,
      run,
      () => 0
    ).catch((e) => e);
    expect(error).toMatchObject({
      stage: "ecr-inspect",
      status: 0,
      identityChecks: { "config-match": false, "repo-digest-match": true },
    });
    expect(run).toHaveBeenCalledTimes(5);
  });
  it("never retains observed values, arbitrary keys, stderr or cause", async () => {
    const error = await failure(
      JSON.stringify([
        {
          Os: "os-secret",
          Architecture: "arch-secret",
          Id: "id-secret",
          RepoDigests: ["digest-secret"],
          Token: "token-secret",
        },
      ])
    );
    expect(Object.keys(error.identityChecks!)).toEqual([
      ...IDENTITY_CHECK_NAMES,
    ]);
    expect(error.cause).toBeUndefined();
    expect(error.message + JSON.stringify(error) + error.stack).not.toMatch(
      /os-secret|arch-secret|id-secret|digest-secret|token-secret|Token/
    );
    expect(Object.isFrozen(error.identityChecks)).toBe(true);
  });
});

it("copies only allowlisted states and keys into errors", () => {
  const untrusted = {
    ...emptyIdentityChecks(),
    "json-valid": "provider-secret",
    arbitrary: "hidden-secret",
  };
  const error = new DigestFallbackError(
    "hub-inspect",
    0,
    "identity",
    [],
    untrusted as unknown as IdentityChecks
  );
  expect(error.identityChecks).toEqual(emptyIdentityChecks());
  expect(error.message + JSON.stringify(error)).not.toMatch(
    /provider-secret|hidden-secret|arbitrary/
  );
});
