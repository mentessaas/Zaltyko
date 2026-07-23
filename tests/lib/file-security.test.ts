import { describe, expect, it } from "vitest";

import { IMAGE_UPLOADS, VIDEO_UPLOADS, validateUpload } from "@/lib/uploads/file-security";

describe("upload file security", () => {
  it("requires a real PNG signature instead of trusting the MIME type", () => {
    const fake = new TextEncoder().encode("not an image");
    expect(validateUpload(fake, "image/png", IMAGE_UPLOADS)).toEqual({
      ok: false,
      code: "FILE_SIGNATURE_INVALID",
    });
  });

  it("accepts a PNG with a valid signature", () => {
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(validateUpload(png, "image/png", IMAGE_UPLOADS)).toEqual({
      ok: true,
      extension: "png",
    });
  });

  it("accepts MP4/QuickTime containers only when ftyp is present", () => {
    const mp4 = new Uint8Array(12);
    mp4.set(new TextEncoder().encode("....ftyp"));
    expect(validateUpload(mp4, "video/mp4", VIDEO_UPLOADS).ok).toBe(true);
  });
});
