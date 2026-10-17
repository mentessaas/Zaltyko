import { z } from "zod";

export const organizationRoleSchema = z.enum([
  "owner",
  "manager",
  "admin",
  "coach",
]);
export type OrganizationRole = z.infer<typeof organizationRoleSchema>;

export const organizationContextSchema = z.object({
  organizationId: z.string().uuid(),
  locationId: z.string().uuid().nullable(),
  memberId: z.string().uuid(),
  userId: z.string().uuid(),
  role: organizationRoleSchema,
  locationScopeMode: z.enum(["all", "selected"]),
  allowedLocationIds: z.array(z.string().uuid()),
});

export type OrganizationContext = z.infer<typeof organizationContextSchema>;

export function canAccessLocation(
  context: OrganizationContext,
  locationId: string
): boolean {
  return (
    context.locationScopeMode === "all" ||
    context.allowedLocationIds.includes(locationId)
  );
}
