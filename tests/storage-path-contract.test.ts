import { describe, expect, it } from "vitest";

import { extractUploadPath } from "@/lib/supabase/storage-helpers";

describe("extractUploadPath", () => {
  it("recupera rutas del bucket uploads y decodifica segmentos", () => {
    expect(
      extractUploadPath(
        "https://project.supabase.co/storage/v1/object/public/uploads/t1/a1/assessment-videos/video%20uno.mp4"
      )
    ).toBe("t1/a1/assessment-videos/video uno.mp4");
  });

  it("rechaza URLs externas o rutas que no son del bucket uploads", () => {
    expect(extractUploadPath("https://example.com/video.mp4")).toBeNull();
    expect(extractUploadPath("not-a-url")).toBeNull();
  });
});
