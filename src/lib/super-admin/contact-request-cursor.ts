import { z } from "zod";

export const CONTACT_REQUEST_PAGE_SIZE = 25;
export const CONTACT_REQUEST_MAX_PAGE_SIZE = 50;

function isValidCursorTimestamp(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(value)) {
    return false;
  }

  const milliseconds = new Date(`${value.slice(0, 23)}Z`);
  return (
    Number.isFinite(milliseconds.getTime()) &&
    milliseconds.toISOString().slice(0, 19) === value.slice(0, 19)
  );
}

const cursorPayloadSchema = z
  .object({
    version: z.literal(1),
    createdAt: z.string().refine(isValidCursorTimestamp),
    id: z.guid(),
  })
  .strict();

export type ContactRequestCursor = z.infer<typeof cursorPayloadSchema>;

export function encodeContactRequestCursor(
  cursor: Omit<ContactRequestCursor, "version">
): string {
  return Buffer.from(
    JSON.stringify({ version: 1, ...cursor }),
    "utf8"
  ).toString("base64url");
}

export function decodeContactRequestCursor(
  value: string
): ContactRequestCursor | null {
  if (!/^[A-Za-z0-9_-]{1,256}$/.test(value)) return null;

  try {
    const decoded = Buffer.from(value, "base64url");
    if (decoded.toString("base64url") !== value) return null;

    const parsed = JSON.parse(decoded.toString("utf8")) as unknown;
    const result = cursorPayloadSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
