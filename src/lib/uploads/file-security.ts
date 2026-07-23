import path from "node:path";

export const IMAGE_UPLOADS = {
  "image/jpeg": { maxBytes: 5 * 1024 * 1024, extension: "jpg" },
  "image/png": { maxBytes: 5 * 1024 * 1024, extension: "png" },
  "image/gif": { maxBytes: 5 * 1024 * 1024, extension: "gif" },
  "image/webp": { maxBytes: 5 * 1024 * 1024, extension: "webp" },
} as const;

export const VIDEO_UPLOADS = {
  // Supabase Storage plan cap verified remotely: 50 MiB.
  "video/mp4": { maxBytes: 50 * 1024 * 1024, extension: "mp4" },
  "video/webm": { maxBytes: 50 * 1024 * 1024, extension: "webm" },
  "video/quicktime": { maxBytes: 50 * 1024 * 1024, extension: "mov" },
  "video/x-msvideo": { maxBytes: 50 * 1024 * 1024, extension: "avi" },
} as const;

type UploadDefinition = { maxBytes: number; extension: string };

function startsWithBytes(bytes: Uint8Array, signature: number[], offset = 0) {
  return signature.every((value, index) => bytes[offset + index] === value);
}

function ascii(bytes: Uint8Array, offset: number, length: number) {
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}

export function matchesMagicBytes(bytes: Uint8Array, contentType: string) {
  switch (contentType) {
    case "image/jpeg":
      return startsWithBytes(bytes, [0xff, 0xd8, 0xff]);
    case "image/png":
      return startsWithBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "image/gif":
      return ascii(bytes, 0, 4) === "GIF8";
    case "image/webp":
      return ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP";
    case "video/webm":
      return startsWithBytes(bytes, [0x1a, 0x45, 0xdf, 0xa3]);
    case "video/mp4":
    case "video/quicktime":
      return ascii(bytes, 4, 4) === "ftyp";
    case "video/x-msvideo":
      return ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "AVI ";
    default:
      return false;
  }
}

export function validateUpload(
  bytes: Uint8Array,
  contentType: string,
  definitions: Record<string, UploadDefinition>
) {
  const definition = definitions[contentType];
  if (!definition) {
    return { ok: false as const, code: "INVALID_FILE_TYPE" as const };
  }
  if (bytes.byteLength === 0 || bytes.byteLength > definition.maxBytes) {
    return { ok: false as const, code: "FILE_TOO_LARGE" as const };
  }
  if (!matchesMagicBytes(bytes, contentType)) {
    return { ok: false as const, code: "FILE_SIGNATURE_INVALID" as const };
  }
  return { ok: true as const, extension: definition.extension };
}

export function safeUploadExtension(fileName: string, fallbackExtension = "bin") {
  const supplied = path.extname(fileName).slice(1).toLowerCase();
  return /^[a-z0-9]{1,10}$/.test(supplied) ? supplied : fallbackExtension;
}
