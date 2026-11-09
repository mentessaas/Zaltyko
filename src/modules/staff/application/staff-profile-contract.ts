import { z } from "zod";

const hasControlCharacter = /\p{Cc}/u;

function normalizeName(value: string): string {
  return value.normalize("NFC").trim().replace(/\s+/gu, " ");
}

const requiredNameSchema = z
  .string()
  .refine((value) => !hasControlCharacter.test(value), "El nombre contiene caracteres no válidos")
  .transform(normalizeName)
  .pipe(z.string().min(1).max(100));

const preferredNameSchema = z
  .string()
  .refine((value) => !hasControlCharacter.test(value), "El nombre preferido contiene caracteres no válidos")
  .transform(normalizeName)
  .pipe(z.string().max(100))
  .transform((value) => value || null)
  .nullable()
  .optional()
  .transform((value) => value ?? null);

export const staffProfileVersionSchema = z.string().regex(/^v1_[a-f0-9]{64}$/u);
export const staffProfileIdSchema = z.guid();
export const staffProfileIdempotencyKeySchema = z
  .string()
  .trim()
  .min(8)
  .max(180)
  .regex(/^[A-Za-z0-9._~:-]+$/u);

export const staffProfileStatusFilterSchema = z.enum(["active", "archived", "all"]);

export const listOwnerStaffProfilesSchema = z
  .object({
    organizationId: z.guid(),
    status: staffProfileStatusFilterSchema.optional(),
    limit: z
      .string()
      .regex(/^\d{1,2}$/u)
      .transform(Number)
      .pipe(z.number().int().min(1).max(50))
      .optional(),
    cursor: z
      .string()
      .max(128)
      .refine((value) => decodeStaffProfileCursor(value) !== null, "Cursor inválido")
      .optional(),
  })
  .strict();

export const createOwnerStaffProfileSchema = z
  .object({
    organizationId: z.guid(),
    givenName: requiredNameSchema,
    familyName: requiredNameSchema,
    preferredName: preferredNameSchema,
  })
  .strict();

export const updateOwnerStaffProfileSchema = z
  .object({
    organizationId: z.guid(),
    givenName: requiredNameSchema,
    familyName: requiredNameSchema,
    preferredName: preferredNameSchema,
    version: staffProfileVersionSchema,
  })
  .strict();

export const setOwnerStaffProfileActiveSchema = z
  .object({
    organizationId: z.guid(),
    version: staffProfileVersionSchema,
  })
  .strict();

export type StaffProfileStatusFilter = z.infer<typeof staffProfileStatusFilterSchema>;
export type ListOwnerStaffProfilesInput = z.infer<typeof listOwnerStaffProfilesSchema>;
export type CreateOwnerStaffProfileInput = z.infer<typeof createOwnerStaffProfileSchema>;
export type UpdateOwnerStaffProfileInput = z.infer<typeof updateOwnerStaffProfileSchema>;
export type SetOwnerStaffProfileActiveInput = z.infer<typeof setOwnerStaffProfileActiveSchema>;

export function normalizeStaffName(value: string): string {
  return normalizeName(value);
}

export function decodeStaffProfileCursor(value: string): string | null {
  if (!/^[A-Za-z0-9_-]{1,128}$/u.test(value)) return null;

  try {
    const decoded = Buffer.from(value, "base64url");
    if (decoded.toString("base64url") !== value) return null;
    const id = decoded.toString("utf8");
    const parsed = z.guid().safeParse(id);
    return parsed.success ? parsed.data.toLowerCase() : null;
  } catch {
    return null;
  }
}

export function encodeStaffProfileCursor(id: string): string {
  return Buffer.from(id.toLowerCase(), "utf8").toString("base64url");
}
