import fs from "node:fs";
import path from "node:path";

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

describe("billing status surfaces", () => {
  it("keeps exceptional charge statuses readable in dark mode", () => {
    const source = read("src/components/billing/StudentChargesTab.tsx");
    expect(source).toContain("dark:bg-red-950/40 dark:text-red-300");
    expect(source).toContain("dark:bg-orange-950/40 dark:text-orange-300");
    expect(source).toContain("dark:bg-amber-950/40 dark:text-amber-300");
  });

  it("keeps payment warnings readable in dark mode", () => {
    const source = read("src/components/billing/PaymentMethodCard.tsx");
    expect(source).toContain("dark:bg-red-950/30 dark:border-red-900/60");
    expect(source).toContain("dark:text-red-300");
  });
});
