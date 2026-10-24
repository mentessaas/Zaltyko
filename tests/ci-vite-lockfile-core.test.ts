import { describe, expect, it } from "vitest";
import yaml from "js-yaml";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const core = require("../scripts/ci/project-vite-lockfile-core.cjs") as {
  OLD: string;
  NEXT: string;
  INTEGRITY: string;
  ViteProjectionFailure: new (code: string) => Error & { code: string };
  projectViteLockfileCore: (input: {
    baseManifestText: string;
    rawManifestText: string;
    baseLockfileText: string;
    rawLockfileText: string;
  }) => {
    manifestText: string;
    lockfileText: string;
    hashes: Record<string, string>;
  };
  assertCandidateEquivalentToBase: (baseText: string, candidateText: string) => boolean;
};

const peerContext = "@types/node@20.19.43)(jiti@1.21.7)(terser@5.51.2)(tsx@4.23.13";
const viteContext = (version: string) => `${version}(${peerContext})`;
const viteLocator = (version: string) => `vite@${viteContext(version)}`;
const keys = (version: string) => {
  const locator = viteLocator(version);
  return {
    vite: locator,
    react: `@vitejs/plugin-react@5.2.0(${locator})`,
    mocker: `@vitest/mocker@4.1.11(${locator})`,
    paths: `vite-tsconfig-paths@5.1.4(typescript@5.9.3)(${locator})`,
    vitest: `vitest@4.1.11(@opentelemetry/api@1.9.1)(@types/node@20.19.43)(@vitest/coverage-v8@4.1.11)(jsdom@29.1.1)(${locator})`,
    coverage: "@vitest/coverage-v8@4.1.11(vitest@4.1.11)",
  };
};

const oldKeys = keys("6.4.3");
const newKeys = keys("6.4.5");
const oldVitestContext = oldKeys.vitest.slice("vitest@".length);
const newVitestContext = newKeys.vitest.slice("vitest@".length);

const vitePackage = (integrity: string) => ({
  resolution: { integrity },
  engines: { node: "^18.0.0 || ^20.0.0 || >=22.0.0" },
  hasBin: true,
  peerDependencies: {
    "@types/node": "^18.0.0 || ^20.0.0 || >=22.0.0",
    jiti: ">=1.21.0",
    less: "*",
    lightningcss: "^1.21.0",
    sass: "*",
    "sass-embedded": "*",
    stylus: "*",
    sugarss: "*",
    terser: "^5.16.0",
    tsx: "^4.8.1",
    yaml: "^2.4.2",
  },
  peerDependenciesMeta: {
    "@types/node": { optional: true },
    jiti: { optional: true },
    less: { optional: true },
    lightningcss: { optional: true },
    sass: { optional: true },
    "sass-embedded": { optional: true },
    stylus: { optional: true },
    sugarss: { optional: true },
    terser: { optional: true },
    tsx: { optional: true },
    yaml: { optional: true },
  },
});

function lockObject(version: string, driftRaw = false) {
  const context = viteContext(version);
  const snapshotKeys = keys(version);
  const integrity = version === "6.4.3" ? "sha512-vite-old" : core.INTEGRITY;
  const snapshots: Record<string, unknown> = {
    [snapshotKeys.vite]: {
      dependencies: {
        esbuild: "0.25.12",
        fdir: "6.5.0(picomatch@4.0.7)",
        picomatch: "4.0.7",
        postcss: "8.5.28",
        rollup: "4.63.1",
        tinyglobby: "0.2.17",
      },
      optionalDependencies: {
        "@types/node": "20.19.43",
        fsevents: "2.3.3",
        jiti: "1.21.7",
        terser: "5.51.2",
        tsx: "4.23.13",
      },
    },
    [snapshotKeys.react]: { dependencies: { vite: context } },
    [snapshotKeys.mocker]: { optionalDependencies: { vite: context } },
    [snapshotKeys.paths]: { optionalDependencies: { vite: context } },
    [snapshotKeys.vitest]: {
      dependencies: {
        "@vitest/mocker": `4.1.11(vite@${context})`,
        vite: context,
      },
    },
    [snapshotKeys.coverage]: {
      dependencies: { vitest: snapshotKeys.vitest.slice("vitest@".length) },
    },
    "unrelated@1.0.0": {
      dependencies: { leftpad: driftRaw ? "1.0.2" : "1.0.0" },
    },
  };

  const importer: Record<string, unknown> = {
    dependencies: { react: { specifier: "^18", version: "18.3.1" } },
    devDependencies: {
      "@vitejs/plugin-react": { specifier: "^5.2.0", version: `5.2.0(${viteLocator(version)})` },
      vite: { specifier: version, version: context },
      "vite-tsconfig-paths": { specifier: "^5.1.0", version: `5.1.4(typescript@5.9.3)(${viteLocator(version)})` },
      vitest: { specifier: "^4.1.11", version: snapshotKeys.vitest.slice("vitest@".length) },
      "@vitest/coverage-v8": { specifier: "^4.1.11", version: "4.1.11(vitest@4.1.11)" },
      eslint: { specifier: "^8", version: "8.57.1" },
    },
  };

  return {
    lockfileVersion: "9.0",
    settings: { autoInstallPeers: true, excludeLinksFromLockfile: false },
    importers: { ".": importer },
    packages: {
      [`vite@${version}`]: vitePackage(integrity),
      "unrelated@1.0.0": { resolution: { integrity: "sha512-unrelated" } },
    },
    snapshots,
  };
}

function stringifyLock(lock: unknown) {
  return yaml.dump(lock, { lineWidth: -1, noRefs: true, quotingType: "'" });
}

function manifest(version: string) {
  return JSON.stringify({
    name: "fixture",
    dependencies: { react: "^18" },
    devDependencies: { vite: version, vitest: "^4.1.11" },
  }, null, 2) + "\n";
}

function fixture(driftRaw = false) {
  return {
    baseManifestText: manifest("6.4.3"),
    rawManifestText: manifest("6.4.5"),
    baseLockfileText: stringifyLock(lockObject("6.4.3")),
    rawLockfileText: stringifyLock(lockObject("6.4.5", driftRaw)),
  };
}

function replaceUnique(text: string, before: string, after: string) {
  const first = text.indexOf(before);
  if (first < 0 || text.indexOf(before, first + before.length) >= 0) {
    throw new Error("fixture transformation mismatch");
  }
  return text.slice(0, first) + after + text.slice(first + before.length);
}

const OLD_VITE_INTEGRITY = "sha512-NTKlcQjlAK7MlQoyb6LgaqHc8sso/pVyUJYWMws3jg21uTJw/LddqIFPcPqP6PzpgbIcZyKI85sFE4HBrQDA8A==";

function checkoutFilesAtVersion(manifestText: string, lockfileText: string, from: string, to: string) {
  const locator = `vite@${from}`;
  if (!lockfileText.includes(locator)) throw new Error("checkout lockfile locator mismatch");
  const integrityFrom = from === "6.4.3" ? OLD_VITE_INTEGRITY : core.INTEGRITY;
  const integrityTo = to === "6.4.3" ? OLD_VITE_INTEGRITY : core.INTEGRITY;
  let nextLockfileText = lockfileText
    .replaceAll(locator, `vite@${to}`)
    .replaceAll(viteContext(from), viteContext(to));
  nextLockfileText = replaceUnique(nextLockfileText, `        specifier: ${from}\n`, `        specifier: ${to}\n`);
  nextLockfileText = replaceUnique(nextLockfileText, integrityFrom, integrityTo);
  return {
    manifestText: replaceUnique(manifestText, `"vite": "${from}"`, `"vite": "${to}"`),
    lockfileText: nextLockfileText,
  };
}

function realCheckoutFixture(requestedSourceVersion?: "6.4.3" | "6.4.5") {
  const checkoutLockfileText = readFileSync(fileURLToPath(new URL("../pnpm-lock.yaml", import.meta.url)), "utf8");
  const checkoutManifestText = readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8");
  const packageJson = JSON.parse(checkoutManifestText) as { devDependencies?: { vite?: string } };
  const checkoutVersion = packageJson.devDependencies?.vite;
  if (checkoutVersion !== "6.4.3" && checkoutVersion !== "6.4.5") {
    throw new Error(`unsupported checkout Vite pin: ${String(checkoutVersion)}`);
  }
  const sourceVersion = requestedSourceVersion ?? checkoutVersion;
  const sourceFiles = checkoutVersion === sourceVersion
    ? { manifestText: checkoutManifestText, lockfileText: checkoutLockfileText }
    : checkoutFilesAtVersion(checkoutManifestText, checkoutLockfileText, checkoutVersion, sourceVersion);
  const fromVersion = sourceVersion === "6.4.3" ? "6.4.3" : "6.4.5";
  const toVersion = sourceVersion === "6.4.3" ? "6.4.5" : "6.4.3";
  const targetFiles = checkoutFilesAtVersion(sourceFiles.manifestText, sourceFiles.lockfileText, fromVersion, toVersion);
  const baseFiles = sourceVersion === "6.4.3" ? sourceFiles : targetFiles;
  const rawFiles = sourceVersion === "6.4.3" ? targetFiles : sourceFiles;
  return {
    baseManifestText: baseFiles.manifestText,
    rawManifestText: rawFiles.manifestText,
    baseLockfileText: baseFiles.lockfileText,
    rawLockfileText: rawFiles.lockfileText,
    sourceVersion,
  };
}

function rawLockWith(change: (lock: any) => void, driftRaw = false) {
  const lock = lockObject("6.4.5", driftRaw);
  change(lock);
  return stringifyLock(lock);
}

function expectFailure(action: () => unknown) {
  expect(action).toThrow(core.ViteProjectionFailure);
}

describe("Vite 6.4.3 to 6.4.5 lockfile core", () => {
  it.each([false, true])("projects the six snapshots and preserves base off-scope bytes (raw drift: %s)", (driftRaw) => {
    const input = fixture(driftRaw);
    const projected = core.projectViteLockfileCore(input);
    expect(projected.manifestText).toContain('"vite": "6.4.5"');
    expect(projected.lockfileText).toContain("leftpad: 1.0.0");
    expect(projected.lockfileText).not.toContain("leftpad: 1.0.2");
    expect(projected.lockfileText).toContain(`vitest: ${newVitestContext}`);
    expect(projected.lockfileText).not.toContain(oldVitestContext);
    expect(projected.lockfileText).not.toContain("4.1.11(4.1.11(");
    expect(projected.hashes.projectedLockfileSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(core.assertCandidateEquivalentToBase(input.baseLockfileText, projected.lockfileText)).toBe(true);
  });

  it("reads the checkout lockfile format and projects a synthetic in-memory Vite target", () => {
    const input = realCheckoutFixture();
    const result = core.projectViteLockfileCore(input);
    expect(result.lockfileText).toContain("vite@6.4.5:");
    expect(result.lockfileText).toContain(`vitest: ${newVitestContext}`);
    expect(result.lockfileText).not.toContain("vite@6.4.3");
    expect(result.lockfileText).not.toContain("4.1.11(4.1.11(");
  });

  it("accepts a checkout fixture already pinned to 6.4.5 by synthesizing the 6.4.3 preimage", () => {
    const input = realCheckoutFixture("6.4.5");
    expect(input.sourceVersion).toBe("6.4.5");
    expect(JSON.parse(input.rawManifestText).devDependencies.vite).toBe("6.4.5");
    expect(JSON.parse(input.baseManifestText).devDependencies.vite).toBe("6.4.3");
    const result = core.projectViteLockfileCore(input);
    expect(result.lockfileText).toContain("vite@6.4.5:");
    expect(result.hashes.projectedLockfileSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("uses the real bare Vitest context for coverage and rejects a duplicated wrapper", () => {
    const input = fixture();
    const good = core.projectViteLockfileCore(input);
    expect(good.lockfileText).toContain(`vitest: ${newVitestContext}`);
    const bad = rawLockWith((lock) => {
      lock.snapshots[newKeys.coverage].dependencies.vitest = `4.1.11(${newVitestContext})`;
    });
    expectFailure(() => core.projectViteLockfileCore({ ...input, rawLockfileText: bad }));
  });

  it("rejects an extra Vite peer parent and an extra Vite dependency edge", () => {
    const input = fixture();
    const extraParent = rawLockWith((lock) => {
      lock.snapshots[`foo@1.0.0(vite@${viteContext("6.4.5")})`] = { dependencies: { foo: "1.0.0" } };
    });
    const extraDependency = rawLockWith((lock) => {
      lock.snapshots["foo@1.0.0"] = { dependencies: { vite: viteContext("6.4.5") } };
    });
    const nakedParent = rawLockWith((lock) => {
      lock.snapshots["foo@1.0.0(vite@6.4.5)"] = { dependencies: { foo: "1.0.0" } };
    });
    const namedDependencyWithoutPeerContext = rawLockWith((lock) => {
      lock.snapshots["foo@1.0.0"] = { dependencies: { vite: "6.4.5" } };
    });
    expectFailure(() => core.projectViteLockfileCore({ ...input, rawLockfileText: extraParent }));
    expectFailure(() => core.projectViteLockfileCore({ ...input, rawLockfileText: extraDependency }));
    expectFailure(() => core.projectViteLockfileCore({ ...input, rawLockfileText: nakedParent }));
    expectFailure(() => core.projectViteLockfileCore({ ...input, rawLockfileText: namedDependencyWithoutPeerContext }));
  });

  it("rejects changes to another importer while allowing resolver drift outside copied blocks", () => {
    const input = fixture();
    const extraImporter = rawLockWith((lock) => {
      lock.importers["./other"] = { devDependencies: { vite: { specifier: "6.4.5", version: viteContext("6.4.5") } } };
    });
    expectFailure(() => core.projectViteLockfileCore({ ...input, rawLockfileText: extraImporter }));

    const wrongImporterScalar = rawLockWith((lock) => {
      lock.importers["."].devDependencies.vite.specifier = "6.4.4";
    });
    expectFailure(() => core.projectViteLockfileCore({ ...input, rawLockfileText: wrongImporterScalar }));

    const rawWithOffscope = fixture(true);
    expect(() => core.projectViteLockfileCore(rawWithOffscope)).not.toThrow();

    const offscopeManifest = { ...input, rawManifestText: input.rawManifestText.replace('"react": "^18"', '"react": "^19"') };
    expectFailure(() => core.projectViteLockfileCore(offscopeManifest));
  });

  it("rejects candidate drift outside the allowed Vite paths", () => {
    const input = fixture();
    const projected = core.projectViteLockfileCore(input);
    const changed = projected.lockfileText.replace("leftpad: 1.0.0", "leftpad: 1.0.1");
    expectFailure(() => core.assertCandidateEquivalentToBase(input.baseLockfileText, changed));
  });

  it("rejects unapproved package metadata and integrity", () => {
    const input = fixture();
    const extraMetadata = rawLockWith((lock) => { lock.packages["vite@6.4.5"].deprecated = "unexpected"; });
    const wrongIntegrity = rawLockWith((lock) => { lock.packages["vite@6.4.5"].resolution.integrity = "sha512-wrong"; });
    expectFailure(() => core.projectViteLockfileCore({ ...input, rawLockfileText: extraMetadata }));
    expectFailure(() => core.projectViteLockfileCore({ ...input, rawLockfileText: wrongIntegrity }));
  });

  it("rejects duplicate JSON and YAML keys", () => {
    const input = fixture();
    const duplicateJson = '{\n  "devDependencies": { "vite": "6.4.3", "vite": "6.4.3" }\n}\n';
    expectFailure(() => core.projectViteLockfileCore({ ...input, baseManifestText: duplicateJson }));

    const duplicateProtoJson = '{\n  "__proto__": {"safe": true},\n  "__proto__": {"safe": false},\n  "devDependencies": {"vite": "6.4.3"}\n}\n';
    expectFailure(() => core.projectViteLockfileCore({ ...input, baseManifestText: duplicateProtoJson }));

    const marker = `      vite: ${viteContext("6.4.5")}\n`;
    const duplicateYaml = input.rawLockfileText.replace(marker, marker + marker);
    expect(duplicateYaml).not.toBe(input.rawLockfileText);
    expectFailure(() => core.projectViteLockfileCore({ ...input, rawLockfileText: duplicateYaml }));
  });
});
