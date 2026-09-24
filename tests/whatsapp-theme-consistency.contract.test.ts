import fs from "node:fs";
import path from "node:path";

describe("WhatsApp communication theme", () => {
  it("keeps delivery statuses and failure reasons readable in dark mode", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/components/whatsapp/WhatsAppHistory.tsx"), "utf8");
    expect(source).toContain("dark:bg-red-950/40 dark:text-red-300");
    expect(source).toContain("dark:bg-red-950/30 dark:border-red-900/60");
    expect(source).toContain("dark:text-red-300");
  });

  it("communicates send results with accessible contrast", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/components/whatsapp/WhatsAppMessagePanel.tsx"), "utf8");
    expect(source).toContain("dark:bg-green-950/30");
    expect(source).toContain("dark:bg-red-950/30");
  });
});
