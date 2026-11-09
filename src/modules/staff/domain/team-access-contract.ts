import { z } from "zod";

export const teamOrganizationSchema = z.object({ organizationId: z.string().uuid() }).strict();
export const teamInvitationIdSchema = z.string().uuid();
export const teamIdempotencyKeySchema = z.string().trim().min(8).max(128).regex(/^[A-Za-z0-9:_-]+$/);
export const teamRevisionSchema = z.string().regex(/^(?:"[1-9][0-9]*"|[1-9][0-9]*)$/)
  .transform(value => Number(value.replaceAll('"', "")))
  .refine(Number.isSafeInteger);
export const teamTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const teamTokenBodySchema = z.object({ token: teamTokenSchema }).strict();
export const createTeamInvitationSchema = teamOrganizationSchema.extend({
  email: z.string().trim().toLowerCase().email().max(254),
  role: z.enum(["manager", "coach"]),
  locationIds: z.array(z.string().uuid()).min(1).max(500)
    .refine(values => new Set(values).size === values.length, "Selecciona sedes únicas")
    .transform(values => [...values].sort()),
}).strict();

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
};
export type TeamAccess = {
  organization: { id: string; name: string };
  activeLocations: TeamLocation[];
  invitations: TeamInvitation[];
  members: Array<{
    id: string;
    role: TeamMemberRole;
    status: TeamMemberStatus;
    locationScopeMode: "all" | "selected";
    effectiveLocations: TeamLocation[];
  }>;
};
export type TeamInvitationResult = { invitation: TeamInvitation; token: string | null; replayed: boolean };
export type TeamInvitationRevokeResult = { id: string; status: "revoked"; revision: number; replayed: boolean };
export type TeamInvitationInspection = {
  organization: { id: string; name: string };
  role: TeamInvitationRole;
  locations: TeamLocation[];
};
export type TeamInvitationAcceptance = {
  membership: { id: string; role: TeamInvitationRole; status: "active"; locationScopeMode: "selected"; locations: TeamLocation[] };
  replayed: boolean;
};
