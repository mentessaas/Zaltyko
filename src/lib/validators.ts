import { z } from "zod";

export const uuidSchema = z.string().uuid("Invalid UUID format");

export function validateUuid(id: string): { valid: boolean; error?: string } {
  const result = uuidSchema.safeParse(id);
  if (!result.success) {
    return { valid: false, error: result.error.errors[0].message };
  }
  return { valid: true };
}
