import { z } from "zod";

export const organizationRoleSchema = z.enum([
  "owner",
  "manager",
  "admin",
  "coach",
]);
export type OrganizationRole = z.infer<typeof organizationRoleSchema>;

export const organizationContextSchema = z.object({
  organizationId: z.guid(),
  locationId: z.guid().nullable(),
  memberId: z.guid(),
  userId: z.guid(),
  role: organizationRoleSchema,
  locationScopeMode: z.enum(["all", "selected"]),
  allowedLocationIds: z.array(z.guid()),
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
