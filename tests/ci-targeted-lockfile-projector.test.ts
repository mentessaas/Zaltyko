import { describe, expect, it } from "vitest";

const projector = require("../scripts/ci/project-targeted-lockfile-refresh.cjs") as {
  BLOCKS: Array<{ section: string; baseKey: string; rawKey: string }>;
  assertProjectedHash: (text: string, expectedHash: string) => string;
  projectLockfileText: (input: { baseText: string; rawText: string }) => {
    candidateText: string;
    baseSha256: string;
    rawSha256: string;
    projectedSha256: string;
  };
};
const lockfileGuard = require("../scripts/ci/validate-lockfile-refresh.cjs") as {
  validateLockfileRefresh: (input: { beforeText: string; afterText: string; changedFiles: string[] }) => void;
};

const FOLLOW_TARGET_INTEGRITY = "sha512-FNvFGzoMLWmE6Yj9spb/zjd7yiNCHiAW9/Tg9CXrQ8wuu32HtlJOwWO11OJafl5FfY3DxTdQ0vj42zU1kvv5jg==";
const HONO_TARGET_INTEGRITY = "sha512-CQ46U0ZkAGmbT/4UxdzzGJpacP2IeKgY4a5/tOI9AABbpOMfK739wfDXmv1usCk+3RkKj1hQy4/fjhiwa2xlrA==";

function makeLockfile(followVersion: string, honoVersion: string, followIntegrity: string, honoIntegrity: string) {
  const serverSnapshot = "@hono/node-server@2.1.1(hono@" + honoVersion + ")";
  const lines = [
    "lockfileVersion: '9.0'",
    "",
    "importers:",
    "  .:",
    "    dependencies:",
    "      axios: 1.20.0",
    "",
    "packages:",
    "  '@hono/node-server@2.1.1':",
    "    resolution: {integrity: sha512-node-server}",
    "    peerDependencies:",
    "      hono: ^4",
    "",
    "  '@modelcontextprotocol/sdk@1.32.1':",
    "    resolution: {integrity: sha512-sdk}",
    "",
    "  axios@1.20.0:",
    "    resolution: {integrity: sha512-axios}",
    "",
    "  follow-redirects@" + followVersion + ":",
    "    resolution: {integrity: " + followIntegrity + "}",
    "    engines: {node: '>=4.0'}",
    "    peerDependencies:",
    "      debug: '*'",
    "    peerDependenciesMeta:",
    "      debug:",
    "        optional: true",
    "",
    "  hono@" + honoVersion + ":",
    "    resolution: {integrity: " + honoIntegrity + "}",
    "    engines: {node: '>=16.9.0'}",
    "",
    "  unrelated@1.0.0:",
    "    resolution: {integrity: sha512-offscope-base}",
    "    engines: {node: '>=18'}",
    "    dependencies:",
    "      unrelated-dep: 1.0.0",
    "    peerDependencies:",
    "      unrelated-peer: ^1",
    "    optionalDependencies:",
    "      unrelated-optional: ^1",
    "",
    "snapshots:",
    "  '" + serverSnapshot + "':",
    "    dependencies:",
    "      hono: " + honoVersion,
    "",
    "  '@modelcontextprotocol/sdk@1.32.1(zod@3.25.76)':",
    "    dependencies:",
    "      '@hono/node-server': 2.1.1(hono@" + honoVersion + ")",
    "      hono: " + honoVersion,
    "",
    "  axios@1.20.0:",
    "    dependencies:",
    "      follow-redirects: " + followVersion,
    "",
    "  follow-redirects@" + followVersion + ": {}",
    "",
    "  hono@" + honoVersion + ": {}",
    "",
    "  unrelated@1.0.0: {}",
  ];
  return lines.join("\n") + "\n";
}

const baseText = makeLockfile(
  "1.16.0",
  "4.13.7",
  "sha512-b2xkZm9sbG93",
  "sha512-b2xkaG9ubw==",
);
const rawText = makeLockfile("1.16.1", "4.13.13", FOLLOW_TARGET_INTEGRITY, HONO_TARGET_INTEGRITY);

describe("targeted lockfile projection", () => {
  it("copies exactly seven resolver blocks and preserves unrelated base bytes", () => {
    const rawWithOffscopeDrift = rawText
      .replace("sha512-offscope-base", "sha512-offscope-resolved")
      .replace("node: '>=18'", "node: '>=20'")
      .replace("unrelated-dep: 1.0.0", "unrelated-dep: 2.0.0")
      .replace("unrelated-peer: ^1", "unrelated-peer: ^2")
      .replace("unrelated-optional: ^1", "unrelated-optional: ^2")
      .replace("      unrelated-optional: ^2\n", "      unrelated-optional: ^2\n    deprecated: raw-only\n");
    const result = projector.projectLockfileText({ baseText, rawText: rawWithOffscopeDrift });

    expect(projector.BLOCKS).toHaveLength(7);
    expect(result.candidateText).toContain("sha512-offscope-base");
    expect(result.candidateText).not.toContain("sha512-offscope-resolved");
    expect(result.candidateText).not.toContain("raw-only");
    expect(result.candidateText).toBe(rawText);
    for (const { section, rawKey } of projector.BLOCKS) {
      const scalar = rawKey.startsWith("@") ? "'" + rawKey + "'" : rawKey;
      const getBlock = (text: string) => {
        const sectionText = text.split("\n" + section + ":\n")[1];
        const start = sectionText.indexOf("  " + scalar + ":");
        const remaining = sectionText.slice(start);
        const next = remaining.slice(1).search(/\n  \S/);
        return next === -1 ? remaining : remaining.slice(0, next + 2);
      };
      expect(getBlock(result.candidateText)).toBe(getBlock(rawWithOffscopeDrift));
    }
    expect(() => lockfileGuard.validateLockfileRefresh({
      beforeText: baseText,
      afterText: rawWithOffscopeDrift,
      changedFiles: ["pnpm-lock.yaml"],
    })).toThrow(/cambios semánticos/);
    expect(() => lockfileGuard.validateLockfileRefresh({
      beforeText: baseText,
      afterText: result.candidateText,
      changedFiles: ["pnpm-lock.yaml"],
    })).not.toThrow();
  });

  it("fails closed when target metadata adds a dependency or changes an integrity", () => {
    const newDependency = rawText.replace(
      "  hono@4.13.13:\n    resolution:",
      "  hono@4.13.13:\n    dependencies:\n      unapproved-dependency: 1.0.0\n    resolution:",
    );
    const wrongIntegrity = rawText.replace(HONO_TARGET_INTEGRITY, "sha512-not-approved");
    expect(() => projector.projectLockfileText({ baseText, rawText: newDependency })).toThrow();
    expect(() => projector.projectLockfileText({ baseText, rawText: wrongIntegrity })).toThrow();
  });

  it("rejects additional peer contexts, duplicate blocks, unsupported format and importer changes", () => {
    const extraPeerContext = rawText.replace(
      "  '@hono/node-server@2.1.1(hono@4.13.13)':\n",
      "  '@hono/node-server@2.1.1(hono@4.13.11)':\n    dependencies:\n      hono: 4.13.11\n\n  '@hono/node-server@2.1.1(hono@4.13.13)':\n",
    );
    const duplicateBlock = rawText.replace(
      "  follow-redirects@1.16.1: {}\n",
      "  follow-redirects@1.16.1: {}\n  follow-redirects@1.16.1: {}\n",
    );
    const unsupportedFormat = rawText.replace(/\n/g, "\r\n");
    const changedImporter = rawText.replace("      axios: 1.20.0\n", "      axios: 1.20.1\n");
    const duplicateSection = rawText + "\nsnapshots:\n  duplicate: {}\n";

    for (const invalidRaw of [extraPeerContext, duplicateBlock, unsupportedFormat, changedImporter, duplicateSection]) {
      expect(() => projector.projectLockfileText({ baseText, rawText: invalidRaw })).toThrow();
    }
  });

  it("rejects missing raw blocks and verifies the candidate hash after installation", () => {
    const missingBlock = rawText.replace("  hono@4.13.13: {}\n", "");
    expect(() => projector.projectLockfileText({ baseText, rawText: missingBlock })).toThrow();

    const projected = projector.projectLockfileText({ baseText, rawText });
    expect(projector.assertProjectedHash(projected.candidateText, projected.projectedSha256)).toBe(projected.projectedSha256);
    expect(() => projector.assertProjectedHash(projected.candidateText + "\n", projected.projectedSha256)).toThrow(/cambió/);
  });
});
