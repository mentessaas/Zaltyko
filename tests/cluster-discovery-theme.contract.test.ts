import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("cluster discovery theme", () => {
  it("keeps public academy discovery readable in dark mode", () => {
    const source = readFileSync("src/app/(site)/home/ClusterDiscoverySection.tsx", "utf8");
    expect(source).toContain("dark:bg-background");
    expect(source).toContain("dark:bg-card");
    expect(source).toContain("dark:border-border");
    expect(source).toContain("dark:text-foreground");
  });
});
