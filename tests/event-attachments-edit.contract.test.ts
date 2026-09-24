import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("event attachment editor", () => {
  it("normalizes attachment objects to URLs for the upload widget and preserves metadata", () => {
    const source = readFileSync("src/components/events/EventFormSections.tsx", "utf8");
    expect(source).toContain("files={(field.value ?? []).map((attachment) => attachment.url)}");
    expect(source).toContain("existing ?? { name: url.split(\"/\").pop() || \"Archivo adjunto\", url }");
  });
});
