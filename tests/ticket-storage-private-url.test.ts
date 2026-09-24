import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("private ticket attachment contract", () => {
  it("does not persist public Storage URLs for ticket attachments", () => {
    const source = readFileSync("src/lib/storage/ticket-storage.ts", "utf8");
    expect(source).toContain("storage://ticket-attachments/");
    expect(source).not.toContain("getPublicUrl(fileName)");
  });

  it("resolves private references only in the authorized ticket page", () => {
    const source = readFileSync("src/app/app/[academyId]/support/[ticketId]/page.tsx", "utf8");
    expect(source).toContain("createSignedUrl");
    expect(source).toContain("storage://ticket-attachments/");
  });
});
