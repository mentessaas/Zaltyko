import type { GroupsBundle } from "./owner-groups-manager-model";

type Membership = GroupsBundle["memberships"][number];

export type ConfirmedGroupMembership = Membership & { groupId: string };

const openMembershipStatuses: readonly string[] = ["pending", "active", "paused"];

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Nombre visible de la ficha creada con «Crear y añadir al grupo». */
export function createdAthleteName(commandBody: string): string {
  try {
    const command: unknown = JSON.parse(commandBody);
    if (!record(command) || !record(command.newAthlete)) return "";
    const { givenName, familyName } = command.newAthlete;
    if (typeof givenName !== "string" || typeof familyName !== "string") return "";
    return [givenName.trim(), familyName.trim()].filter(Boolean).join(" ");
  } catch {
    return "";
  }
}

/** Pertenencia que el servidor confirmó al crear una ficha o añadir una gimnasta al grupo. */
export function confirmedGroupMembership(
  payload: unknown,
  expected: { groupId: string; athleteName: string }
): ConfirmedGroupMembership | null {
  if (!record(payload) || payload.ok !== true || !record(payload.data)) return null;
  const { id, groupId, athleteId, startsOn, status } = payload.data;
  const athleteName = expected.athleteName.trim();
  if (typeof id !== "string" || !id || typeof groupId !== "string" || groupId !== expected.groupId ||
      typeof athleteId !== "string" || !athleteId || typeof startsOn !== "string" ||
      typeof status !== "string" || !openMembershipStatuses.includes(status) || !athleteName) return null;
  return {
    id,
    groupId,
    athleteId,
    athleteName,
    status: status as Membership["status"],
    startsOn,
    endsOn: null,
  };
}

/**
 * Añade al grupo abierto las pertenencias confirmadas en esta página mientras
 * router.refresh() trae el listado. Un listado del servidor que aún no las
 * incluye (refresco lento o desordenado) no puede ocultar un alta confirmada.
 */
export function withConfirmedGroupMemberships(
  bundle: GroupsBundle,
  confirmed: readonly ConfirmedGroupMembership[]
): GroupsBundle {
  const selectedGroupId = bundle.selectedGroupId;
  const listed = new Set(bundle.memberships.map((membership) => membership.id));
  const added = confirmed.filter((membership) =>
    membership.groupId === selectedGroupId && !listed.has(membership.id));
  if (added.length === 0) return bundle;
  return {
    ...bundle,
    groups: bundle.groups.map((group) =>
      group.id === selectedGroupId ? { ...group, memberCount: group.memberCount + added.length } : group),
    memberships: [
      ...bundle.memberships,
      ...added.map(({ id, athleteId, athleteName, status, startsOn, endsOn }) => ({
        id, athleteId, athleteName, status, startsOn, endsOn,
      })),
    ],
  };
}

/** Una vez que el servidor lista la pertenencia, su listado vuelve a mandar. */
export function pruneConfirmedGroupMemberships(
  confirmed: readonly ConfirmedGroupMembership[],
  bundle: GroupsBundle
): readonly ConfirmedGroupMembership[] {
  const listed = new Set(bundle.memberships.map((membership) => membership.id));
  const pending = confirmed.filter((membership) => !listed.has(membership.id));
  return pending.length === confirmed.length ? confirmed : pending;
}
