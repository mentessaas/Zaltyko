import fs from "node:fs";
import path from "node:path";

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

describe("billing status surfaces", () => {

  it("keeps payment warnings readable in dark mode", () => {
    const source = read("src/components/billing/PaymentMethodCard.tsx");
    expect(source).toContain("dark:bg-red-950/30 dark:border-red-900/60");
    expect(source).toContain("dark:text-red-300");
  });
});
