import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const auditor = fileURLToPath(
  new URL("../scripts/audit-env-contract.ts", import.meta.url)
);
const tsx = require.resolve("tsx/cli");
const example = readFileSync(
  new URL("../.env.example", import.meta.url),
  "utf8"
);
const marker = "ZALTYKO_E2E_WEBPACK_BUILD_WORKER";

function fixture(check: (root: string) => void) {
  const root = mkdtempSync(join(tmpdir(), "webpack-env-contract-"));
  try {
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "next.config.mjs"), `process.env.${marker};`);
    check(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function audit(root: string) {
  return spawnSync(process.execPath, [tsx, auditor], {
    cwd: root,
    env: {},
    encoding: "utf8",
    timeout: 5000,
  });
}

describe("local webpack worker environment documentation", () => {
  it("declares the server-only marker once with a disabled default", () => {
    expect(example.match(/^ZALTYKO_E2E_WEBPACK_BUILD_WORKER=/gm)).toHaveLength(
      1
    );
    expect(example).toContain(`${marker}=false`);
    expect(example).not.toContain(`NEXT_PUBLIC_${marker}`);
    expect(example).toContain("requiere E2E_LOCAL_SUPABASE=true");
  });

  it("the unchanged auditor rejects the missing marker and accepts its declaration", () => {
    fixture((root) => {
      writeFileSync(
        join(root, ".env.example"),
        example.replace(/^ZALTYKO_E2E_WEBPACK_BUILD_WORKER=.*\n/m, "")
      );
      const missing = audit(root);
      expect(missing.status).toBe(1);
      expect(missing.stderr).toContain(marker);
      writeFileSync(join(root, ".env.example"), example);
      const documented = audit(root);
      expect(documented.status).toBe(0);
      expect(documented.stdout).toContain("[env-contract] PASS");
    });
  });

  it("continues rejecting a new undocumented runtime variable", () => {
    fixture((root) => {
      writeFileSync(join(root, ".env.example"), example);
      writeFileSync(
        join(root, "src", "sample.ts"),
        "process.env.UNDOCUMENTED_SYNTHETIC_VARIABLE;"
      );
      const result = audit(root);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("UNDOCUMENTED_SYNTHETIC_VARIABLE");
    });
  });
});
