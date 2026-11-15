import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("spreadsheet export safety", () => {
  it("sanitizes formula prefixes in user-controlled text", () => {
    const transactions = readFileSync(
      join(process.cwd(), "src/app/api/transactions/export/route.ts"),
      "utf8"
    );
    expect(transactions).toContain("safeSpreadsheetText");
    expect(transactions).toContain("/^[=+\\-@]/");
  });
});
