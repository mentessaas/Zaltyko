import { describe, expect, it } from "vitest";
const {
  MAX_GIT_OUTPUT_BYTES,
  TARGET_VERSIONS,
  assertGitOutputWithinLimit,
  assertExpectedGitStatus,
  execGit,
  validateLockfileRefresh,
} = require("../scripts/ci/validate-lockfile-refresh.cjs") as {
  MAX_GIT_OUTPUT_BYTES: number;
  TARGET_VERSIONS: Array<{ name: string; from: string; to: string; integrity: string }>;
  assertGitOutputWithinLimit: (output: string | Buffer) => string | Buffer;
  assertExpectedGitStatus: (status: string) => void;
  execGit: (args: string[], run?: (...args: unknown[]) => string) => string;
  validateLockfileRefresh: (input: {
    beforeText: string;
    afterText: string;
    changedFiles: string[];
  }) => void;
};

function lockfile({
  followVersion,
  honoVersion,
  followIntegrity,
  honoIntegrity,
  unrelatedVersion = "3.0.0",
}: {
  followVersion: string;
  honoVersion: string;
  followIntegrity: string;
  honoIntegrity: string;
  unrelatedVersion?: string;
}) {
  const nodeServerKey = `@hono/node-server@2.1.1(hono@${honoVersion})`;
  return `
lockfileVersion: '9.0'
packages:
  follow-redirects@${followVersion}:
    resolution:
      integrity: ${followIntegrity}
    engines:
      node: '>=4'
  hono@${honoVersion}:
    resolution:
      integrity: ${honoIntegrity}
    engines:
      node: '>=16.9.0'
  '@hono/node-server@2.1.1':
    peerDependencies:
      hono: ^4
  unrelated@${unrelatedVersion}:
    resolution:
      integrity: sha512-unrelated
snapshots:
  axios@1.20.0:
    dependencies:
      follow-redirects: ${followVersion}
  '${nodeServerKey}':
    dependencies:
      hono: ${honoVersion}
  '@modelcontextprotocol/sdk@1.32.1(zod@3.25.76)':
    dependencies:
      '@hono/node-server': 2.1.1(hono@${honoVersion})
      hono: ${honoVersion}
`;
}

const oldLock = lockfile({
  followVersion: "1.16.0",
  honoVersion: "4.13.7",
  followIntegrity: "sha512-b2xkZm9sbG93",
  honoIntegrity: "sha512-b2xkaG9ubw==",
});
const refreshedLock = lockfile({
  followVersion: "1.16.1",
  honoVersion: "4.13.13",
  followIntegrity: "sha512-FNvFGzoMLWmE6Yj9spb/zjd7yiNCHiAW9/Tg9CXrQ8wuu32HtlJOwWO11OJafl5FfY3DxTdQ0vj42zU1kvv5jg==",
  honoIntegrity: "sha512-CQ46U0ZkAGmbT/4UxdzzGJpacP2IeKgY4a5/tOI9AABbpOMfK739wfDXmv1usCk+3RkKj1hQy4/fjhiwa2xlrA==",
});

describe("lockfile refresh guard", () => {
  it("uses the exact audited targets and their official registry integrities", () => {
    expect(TARGET_VERSIONS).toEqual([
      {
        name: "follow-redirects",
        from: "1.16.0",
        to: "1.16.1",
        integrity: "sha512-FNvFGzoMLWmE6Yj9spb/zjd7yiNCHiAW9/Tg9CXrQ8wuu32HtlJOwWO11OJafl5FfY3DxTdQ0vj42zU1kvv5jg==",
      },
      {
        name: "hono",
        from: "4.13.7",
        to: "4.13.13",
        integrity: "sha512-CQ46U0ZkAGmbT/4UxdzzGJpacP2IeKgY4a5/tOI9AABbpOMfK739wfDXmv1usCk+3RkKj1hQy4/fjhiwa2xlrA==",
      },
    ]);
  });

  it("bounds Git output and rejects a response that exceeds the fixed buffer", () => {
    expect(MAX_GIT_OUTPUT_BYTES).toBe(4 * 1024 * 1024);
    expect(() => assertGitOutputWithinLimit(Buffer.alloc(MAX_GIT_OUTPUT_BYTES))).not.toThrow();
    expect(() => assertGitOutputWithinLimit(Buffer.alloc(MAX_GIT_OUTPUT_BYTES + 1))).toThrow(/excede el límite/);
  });

  it("passes the fixed output cap to every Git subprocess", () => {
    let invocation: unknown[] = [];
    const output = execGit(["show", "expected:pnpm-lock.yaml"], (...args: unknown[]) => {
      invocation = args;
      return "synthetic output";
    });

    expect(output).toBe("synthetic output");
    expect(invocation).toEqual([
      "git",
      ["show", "expected:pnpm-lock.yaml"],
      { encoding: "utf8", maxBuffer: MAX_GIT_OUTPUT_BYTES },
    ]);
  });

  it("accepts only the lockfile change and the exact generated node_modules entry", () => {
    expect(() => assertExpectedGitStatus(" M pnpm-lock.yaml\n")).not.toThrow();
    expect(() => assertExpectedGitStatus(" M pnpm-lock.yaml\n?? node_modules/\n")).not.toThrow();
  });

  it.each([
    ["untracked file inside node_modules", " M pnpm-lock.yaml\n?? node_modules/cache/file\n"],
    ["lookalike node_modules directory", " M pnpm-lock.yaml\n?? node_modules-extra/\n"],
    ["another untracked file", " M pnpm-lock.yaml\n?? unrelated.txt\n"],
    ["another tracked file", " M pnpm-lock.yaml\n M package.json\n"],
    ["missing lockfile change", "?? node_modules/\n"],
  ])("rejects %s", (_reason, status) => {
    expect(() => assertExpectedGitStatus(status)).toThrow();
  });

  it("reports only the fixed Git command, SHA and error code", () => {
    const secretLikeError = Object.assign(new Error("sensitive process detail"), { code: "ENOBUFS" });
    let thrown: Error | undefined;
    try {
      execGit(["show", "a".repeat(40) + ":pnpm-lock.yaml"], () => {
        throw secretLikeError;
      });
    } catch (error) {
      thrown = error as Error;
    }
    expect(thrown?.message).toContain(`git show ${"a".repeat(40)}:pnpm-lock.yaml (ENOBUFS)`);
    expect(thrown?.message).not.toContain("sensitive process detail");
  });

  it("accepts only the two target package updates and their pinned references", () => {
    expect(() => validateLockfileRefresh({
      beforeText: oldLock,
      afterText: refreshedLock,
      changedFiles: ["pnpm-lock.yaml"],
    })).not.toThrow();
  });

  it("rejects changes to another package version", () => {
    const unexpected = lockfile({
      followVersion: "1.16.1",
      honoVersion: "4.13.13",
      followIntegrity: "sha512-FNvFGzoMLWmE6Yj9spb/zjd7yiNCHiAW9/Tg9CXrQ8wuu32HtlJOwWO11OJafl5FfY3DxTdQ0vj42zU1kvv5jg==",
      honoIntegrity: "sha512-CQ46U0ZkAGmbT/4UxdzzGJpacP2IeKgY4a5/tOI9AABbpOMfK739wfDXmv1usCk+3RkKj1hQy4/fjhiwa2xlrA==",
      unrelatedVersion: "3.1.0",
    });
    expect(() => validateLockfileRefresh({
      beforeText: oldLock,
      afterText: unexpected,
      changedFiles: ["pnpm-lock.yaml"],
    })).toThrow(/fuera de ruta permitida|cambios semánticos/);
  });

  it("rejects valid-looking but non-registry integrity values", () => {
    const wrongDigest = refreshedLock.replace(
      "sha512-FNvFGzoMLWmE6Yj9spb/zjd7yiNCHiAW9/Tg9CXrQ8wuu32HtlJOwWO11OJafl5FfY3DxTdQ0vj42zU1kvv5jg==",
      "sha512-bmV3Zm9sbG93",
    );
    expect(() => validateLockfileRefresh({
      beforeText: oldLock,
      afterText: wrongDigest,
      changedFiles: ["pnpm-lock.yaml"],
    })).toThrow(/Integridad de registro inesperada/);
  });

  it("rejects an updated axios graph that retains an indirect old follow-redirects reference", () => {
    const staleIndirect = `${refreshedLock}\n  axios@1.20.0(peer@2.0.0):\n    dependencies:\n      follow-redirects: 1.16.0\n`;
    expect(() => validateLockfileRefresh({
      beforeText: oldLock,
      afterText: staleIndirect,
      changedFiles: ["pnpm-lock.yaml"],
    })).toThrow(/no resuelve follow-redirects@1.16.1/);
  });

  it("rejects manifest or other file changes", () => {
    expect(() => validateLockfileRefresh({
      beforeText: oldLock,
      afterText: refreshedLock,
      changedFiles: ["package.json", "pnpm-lock.yaml"],
    })).toThrow(/Solo se permite modificar pnpm-lock.yaml/);
  });

  it("rejects an updated graph that retains the old node-server peer key and dependency", () => {
    const stalePeer = `${refreshedLock}\n  '@hono/node-server@2.1.1(hono@4.13.7)':\n    dependencies:\n      hono: 4.13.7\n`;
    expect(() => validateLockfileRefresh({
      beforeText: oldLock,
      afterText: stalePeer,
      changedFiles: ["pnpm-lock.yaml"],
    })).toThrow(/conserva un peer context obsoleto/);
  });

  it("rejects an old package locator left beside the refreshed version", () => {
    const staleLocator = refreshedLock.replace(
      "snapshots:\n",
      "  follow-redirects@1.16.0:\n    resolution:\n      integrity: sha512-b2xkZm9sbG93\nsnapshots:\n",
    );
    expect(() => validateLockfileRefresh({
      beforeText: oldLock,
      afterText: staleLocator,
      changedFiles: ["pnpm-lock.yaml"],
    })).toThrow(/Sigue bloqueado follow-redirects@1.16.0/);
  });
});
