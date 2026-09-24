import fs from "node:fs";
import path from "node:path";

describe("support ticket form", () => {
  it("makes submission errors visible and readable in dark mode", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/components/support/TicketForm.tsx"), "utf8");
    expect(source).toContain('role="alert" aria-live="assertive"');
    expect(source).toContain("dark:bg-red-950/30 dark:border-red-900/60 dark:text-red-300");
  });

  it("marks required fields invalid when validation fails", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/components/support/TicketForm.tsx"), "utf8");
    expect(source).toContain("aria-invalid={Boolean(error && !formData.title.trim())}");
    expect(source).toContain("aria-invalid={Boolean(error && !formData.description.trim())}");
  });
});
