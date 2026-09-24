import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("transactional waiting-list promotion", () => {
  it("uses one authorized endpoint and targets the selected entry", () => {
    const route = readFileSync(join(process.cwd(), "src/app/api/class-waiting-list/[entryId]/route.ts"), "utf8");
    const helper = readFileSync(join(process.cwd(), "src/lib/classes/promote-waiting-list.ts"), "utf8");
    const dialog = readFileSync(join(process.cwd(), "src/components/classes/WaitingListDialog.tsx"), "utf8");
    expect(route).toContain("export const POST");
    expect(route).toContain("authorizeClassResource");
    expect(helper).toContain("entryId?: string");
    expect(dialog).toContain("/api/class-waiting-list/${item.id}");
    expect(dialog).not.toContain("/promote");
  });
});
