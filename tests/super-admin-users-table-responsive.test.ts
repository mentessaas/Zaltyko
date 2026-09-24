import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Super Admin users table responsive contract", () => {
  const source = readFileSync(
    "src/app/(super-admin)/super-admin/components/SuperAdminUsersTable.tsx",
    "utf8",
  );

  it("keeps columns aligned when the plan column is hidden below the small breakpoint", () => {
    expect(source).toContain('className="hidden px-4 py-4 align-top sm:table-cell"');
    expect(source).toContain("min-w-[760px]");
    expect(source).toContain("table-fixed");
    expect(source).toContain("overflow-x-auto");
  });

  it("truncates long identity fields and allows action controls to wrap", () => {
    expect(source).toContain('className="truncate font-semibold text-white"');
    expect(source).toContain('className="truncate text-xs text-white/70"');
    expect(source).toContain("flex flex-wrap items-center justify-end gap-2");
  });
});
