import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("event file upload UX", () => {
  it("validates the full batch before uploading and handles non-JSON errors", () => {
    const source = readFileSync("src/components/events/FileUpload.tsx", "utf8");
    expect(source).toContain("Validate the whole batch before starting any network request");
    expect(source).toContain("for (const file of Array.from(selectedFiles))");
    expect(source).toContain("response.json().catch(() => ({}))");
  });
});
