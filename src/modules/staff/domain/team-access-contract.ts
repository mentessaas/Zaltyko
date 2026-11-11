import { z } from "zod";

export const teamOrganizationSchema = z.object({ organizationId: z.string().uuid() }).strict();
export const teamInvitationIdSchema = z.string().uuid();
export const teamIdempotencyKeySchema = z.string().trim().min(8).max(128).regex(/^[A-Za-z0-9:_-]+$/);
export const teamRevisionSchema = z.string().regex(/^(?:"[1-9][0-9]*"|[1-9][0-9]*)$/)
  .transform(value => Number(value.replaceAll('"', "")))
  .refine(Number.isSafeInteger);
export const teamTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const teamTokenBodySchema = z.object({ token: teamTokenSchema }).strict();
const teamPersonNameSchema = z.string().trim().min(1).max(100)
  .refine(value => !/[\u0000-\u001f\u007f]/u.test(value))
  .transform(value => value.normalize("NFC").replace(/\s+/gu, " "));

/**
 * The invitation names the team profile it is for (O3): an existing
 * `staff_profiles` row of the academy, or the given and family names of a new
 * one. Exactly one of the two; absent optionals may arrive as null.
 */
export const createTeamInvitationSchema = teamOrganizationSchema.extend({
  email: z.string().trim().toLowerCase().email().max(254),
  role: z.enum(["manager", "coach"]),
  locationIds: z.array(z.string().uuid()).min(1).max(500)
    .refine(values => new Set(values).size === values.length, "Selecciona sedes únicas")
    .transform(values => [...values].sort()),
  staffProfileId: z.string().uuid().nullable().optional(),
  givenName: teamPersonNameSchema.nullable().optional(),
  familyName: teamPersonNameSchema.nullable().optional(),
}).strict().superRefine((value, context) => {
  const existing = Boolean(value.staffProfileId);
  const named = Boolean(value.givenName) && Boolean(value.familyName);
  const partialName = Boolean(value.givenName) !== Boolean(value.familyName);
  if (existing === named || partialName) {
    context.addIssue({ code: "custom", path: ["staffProfileId"], message: "Elige una ficha del equipo o escribe nombre y apellidos" });
  }
});

/** Invitation targets as the service stores them. */
export type TeamInvitationTarget =
  | { kind: "existing"; staffProfileId: string }
  | { kind: "new"; givenName: string; familyName: string };

export function teamInvitationTarget(value: { staffProfileId?: string | null; givenName?: string | null; familyName?: string | null }): TeamInvitationTarget {
  if (value.staffProfileId) return { kind: "existing", staffProfileId: value.staffProfileId };
  if (value.givenName && value.familyName) return { kind: "new", givenName: value.givenName, familyName: value.familyName };
  throw new Error("Invitation target is required");
}

/**
 * Who may manage invitations (O3). Owner and admin with every site invite a
 * coach or a manager to any active site; a manager invites only coaches and
 * only to sites in their own scope. Coaches and selected-scope owners/admins
 * never manage invitations.
 */
export type TeamInviterAuthority = {
  role: "owner" | "admin" | "manager";
  /** null = every site of the academy. */
  locationIds: string[] | null;
};

export function teamInviterAuthorityFor(member: { role: string; locationScopeMode: string }, scopedLocationIds: string[]): TeamInviterAuthority | null {
  if ((member.role === "owner" || member.role === "admin") && member.locationScopeMode === "all") return { role: member.role, locationIds: null };
  if (member.role === "manager") return { role: "manager", locationIds: member.locationScopeMode === "all" ? null : [...scopedLocationIds].sort() };
  return null;
}

export function teamInvitableRoles(authority: TeamInviterAuthority): TeamInvitationRole[] {
  return authority.role === "manager" ? ["coach"] : ["coach", "manager"];
}

export function canManageTeamInvitation(authority: TeamInviterAuthority, invitation: { role: TeamInvitationRole; locationIds: string[] }): boolean {
  if (!teamInvitableRoles(authority).includes(invitation.role)) return false;
  if (authority.locationIds === null) return true;
  const allowed = new Set(authority.locationIds);
  return invitation.locationIds.length > 0 && invitation.locationIds.every(id => allowed.has(id));
}

/**
 * Delivery while the isolated transactional email (G4) is off: a one-time link
 * the academy copies and shares. When G4 is enabled, the same invitation can
 * be emailed; this is the only switch to change, and nothing is sent today.
 */
export type TeamInvitationDelivery = "manual_link";
export function teamInvitationDelivery(): TeamInvitationDelivery {
  return "manual_link";
}

export type TeamLocation = { id: string; name: string };
export type TeamInvitationRole = "manager" | "coach";
export type TeamMemberRole = "owner" | "admin" | "manager" | "coach";
export type TeamMemberStatus = "invited" | "active" | "suspended" | "revoked";
export type TeamInvitation = {
  id: string;
  email: string;
  role: TeamInvitationRole;
  status: "pending" | "accepted" | "revoked";
  expired: boolean;
  expiresAt: string;
  revision: number;
  requestedLocations: TeamLocation[];
  /** Team profile the invitation is for: existing or to be created on acceptance. */
  person: { kind: "existing" | "new"; staffProfileId: string | null; name: string };
};
export type TeamAccess = {
  organization: { id: string; name: string };
  /** Who is reading and what they may invite (sites already narrowed to their scope). */
  viewer: { role: "owner" | "admin" | "manager"; invitableRoles: TeamInvitationRole[] };
  activeLocations: TeamLocation[];
  /** Active team profiles not linked to an account nor targeted by a pending invitation. */
  linkableStaffProfiles: Array<{ id: string; name: string }>;
  invitations: TeamInvitation[];
  members: Array<{
    id: string;
    role: TeamMemberRole;
    status: TeamMemberStatus;
    locationScopeMode: "all" | "selected";
    effectiveLocations: TeamLocation[];
    /** Linked team profile (staff_profiles.member_id), if any. */
    staffProfile: { id: string; name: string } | null;
  }>;
};
export type TeamInvitationResult = { invitation: TeamInvitation; token: string | null; replayed: boolean; delivery: TeamInvitationDelivery };
export type TeamInvitationRevokeResult = { id: string; status: "revoked"; revision: number; replayed: boolean };
export type TeamInvitationInspection = {
  organization: { id: string; name: string };
  role: TeamInvitationRole;
  locations: TeamLocation[];
};
export type TeamInvitationAcceptance = {
  membership: { id: string; role: TeamInvitationRole; status: "active"; locationScopeMode: "selected"; locations: TeamLocation[]; staffProfileId: string };
  replayed: boolean;
};
