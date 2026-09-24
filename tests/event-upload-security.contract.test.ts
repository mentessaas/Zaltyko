import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../src/app/api/events/upload/route.ts", import.meta.url), "utf8");

describe("event upload security contract", () => {
  it("validates public event images by MIME and magic bytes", () => {
    expect(source).toContain("allowedImageTypes");
    expect(source).toContain("matchesMagicBytes(bytes, file.type)");
    expect(source).toContain("containsKnownMalware(bytes)");
  });

  it("sanitizes the stored extension", () => {
    expect(source).toContain("replace(/[^a-z0-9]/g, \"\")");
  });

  it("restricts public event documents to real PDF/DOC/DOCX content", () => {
    expect(source).toContain("allowedDocumentTypes");
    expect(source).toContain("isOleDocument");
    expect(source).toContain("isZipDocument");
  });
});
