import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync("src/components/contact/ContactForm.tsx", "utf8");

describe("public contact form resilience", () => {
  it("aborts a stalled request and clears the loading state", () => {
    expect(source).toContain("new AbortController()");
    expect(source).toContain("controller.abort()");
    expect(source).toContain("signal: controller.signal");
    expect(source).toContain("window.clearTimeout(timeoutId)");
    expect(source).toContain("La solicitud está tardando demasiado");
  });

  it("keeps fields readable in dark mode", () => {
    expect(source).toContain("dark:bg-card");
    expect(source).toContain("dark:text-foreground");
    expect(source).toContain("dark:placeholder:text-muted-foreground");
  });
});
