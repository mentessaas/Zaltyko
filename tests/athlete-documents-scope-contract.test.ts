import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("athlete documents scope contract", () => {
  it("binds uploads and metadata to the athlete academy", () => {
    const upload = readFileSync(
      join(process.cwd(), "src/app/api/athletes/[athleteId]/documents/upload/route.ts"),
      "utf8"
    );
    const route = readFileSync(
      join(process.cwd(), "src/app/api/athletes/[athleteId]/documents/route.ts"),
      "utf8"
    );

    expect(upload).toContain("ACADEMY_ATHLETE_MISMATCH");
    expect(route).toContain("DOCUMENT_PATH_OUT_OF_SCOPE");
    expect(route).toContain("deleteFile(document.fileUrl)");
    expect(route).toContain("INVALID_DOCUMENT_DATES");
  });
});
