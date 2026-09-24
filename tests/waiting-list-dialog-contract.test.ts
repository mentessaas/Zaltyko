import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("waiting list dialog enrollment contract", () => {
  it("uses the transactional promotion endpoint", () => {
    const source = readFileSync(
      join(process.cwd(), "src/components/classes/WaitingListDialog.tsx"),
      "utf8",
    );
    expect(source).toContain("/api/class-waiting-list/${item.id}");
    expect(source).not.toContain("/promote");
  });
});
