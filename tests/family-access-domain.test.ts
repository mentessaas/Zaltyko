import { describe, expect, it } from "vitest";

import {
  FAMILY_ACCESS_FLAG,
  familyAccessCommandSchema,
  familyInvitationEmail,
  familyInvitationUrl,
  familyNoticeEmail,
  familyPreferencesSchema,
  familyTokenSchema,
  guardianPortalActions,
  guardianPortalStatus,
  isFamilyAccessFlagOn,
  manualNoticeCommandSchema,
  markNoticesReadSchema,
  noticeEmailAllowed,
  sessionChangeCommandSchema,
  sessionNoticeText,
  utcToZonedWallTime,
  zonedWallTimeToUtc,
} from "@/modules/family-access/domain/family-access-contract";
import { noticeDedupeKey, sha256Hex } from "@/modules/family-access/domain/family-access-hash";

const ORG = "11111111-1111-4111-8111-111111111111";
const SITE = "22222222-2222-4222-8222-222222222222";
const GUARDIAN = "33333333-3333-4333-8333-333333333333";
const NOW = new Date("2026-11-14T10:00:00.000Z");

describe("bandera del acceso de familias", () => {
  it("solo se enciende con el valor exacto «true»", () => {
    expect(FAMILY_ACCESS_FLAG).toBe("ZALTYKO_FAMILY_ACCESS_ENABLED");
    expect(isFamilyAccessFlagOn({} as NodeJS.ProcessEnv)).toBe(false);
    for (const value of ["1", "TRUE", "yes", " true", "true "]) {
      expect(isFamilyAccessFlagOn({ ZALTYKO_FAMILY_ACCESS_ENABLED: value } as unknown as NodeJS.ProcessEnv)).toBe(false);
    }
    expect(isFamilyAccessFlagOn({ ZALTYKO_FAMILY_ACCESS_ENABLED: "true" } as unknown as NodeJS.ProcessEnv)).toBe(true);
  });
});

describe("estado del acceso al portal que ve la academia", () => {
  const future = "2026-11-20T10:00:00.000Z";
  const past = "2026-11-01T10:00:00.000Z";

  it("una cuenta vinculada manda sobre cualquier invitación", () => {
    expect(guardianPortalStatus({ hasLinkedAccount: true, latestInvitation: null, now: NOW })).toBe("linked");
    expect(guardianPortalStatus({ hasLinkedAccount: true, latestInvitation: { status: "revoked", expiresAt: past }, now: NOW })).toBe("linked");
  });

  it("sin cuenta, sale de la última invitación", () => {
    expect(guardianPortalStatus({ hasLinkedAccount: false, latestInvitation: null, now: NOW })).toBe("not_invited");
    expect(guardianPortalStatus({ hasLinkedAccount: false, latestInvitation: { status: "pending", expiresAt: future }, now: NOW })).toBe("pending");
    expect(guardianPortalStatus({ hasLinkedAccount: false, latestInvitation: { status: "pending", expiresAt: past }, now: NOW })).toBe("expired");
    expect(guardianPortalStatus({ hasLinkedAccount: false, latestInvitation: { status: "revoked", expiresAt: future }, now: NOW })).toBe("revoked");
    // Aceptada y sin cuenta: la academia retiró el acceso.
    expect(guardianPortalStatus({ hasLinkedAccount: false, latestInvitation: { status: "accepted", expiresAt: past }, now: NOW })).toBe("removed");
  });

  it("caduca exactamente en expiresAt", () => {
    expect(guardianPortalStatus({ hasLinkedAccount: false, latestInvitation: { status: "pending", expiresAt: NOW.toISOString() }, now: NOW })).toBe("expired");
  });

  it("solo ofrece las acciones de cada estado, y sin correo no se invita ni se reenvía", () => {
    expect(guardianPortalActions("not_invited", true)).toEqual({ invite: true, resend: false, revoke: false, removeAccess: false });
    expect(guardianPortalActions("not_invited", false)).toEqual({ invite: false, resend: false, revoke: false, removeAccess: false });
    expect(guardianPortalActions("pending", true)).toEqual({ invite: false, resend: true, revoke: true, removeAccess: false });
    expect(guardianPortalActions("expired", false)).toEqual({ invite: false, resend: false, revoke: true, removeAccess: false });
    expect(guardianPortalActions("linked", true)).toEqual({ invite: false, resend: false, revoke: false, removeAccess: true });
    expect(guardianPortalActions("removed", true).invite).toBe(true);
    expect(guardianPortalActions("revoked", true).invite).toBe(true);
  });
});

describe("esquemas de entrada", () => {
  it("acepta los cinco comandos de acceso y rechaza campos de más", () => {
    const scope = { organizationId: ORG, locationId: SITE };
    expect(familyAccessCommandSchema.safeParse({ ...scope, action: "invite", guardianId: GUARDIAN, grantViewAthletes: true }).success).toBe(true);
    expect(familyAccessCommandSchema.safeParse({ ...scope, action: "invite_all", grantViewAthletes: false }).success).toBe(true);
    expect(familyAccessCommandSchema.safeParse({ ...scope, action: "resend", invitationId: GUARDIAN, revision: 2 }).success).toBe(true);
    expect(familyAccessCommandSchema.safeParse({ ...scope, action: "revoke", invitationId: GUARDIAN, revision: 1 }).success).toBe(true);
    expect(familyAccessCommandSchema.safeParse({ ...scope, action: "remove_access", guardianId: GUARDIAN }).success).toBe(true);
    // Nunca se acepta un correo del cliente: sale del contacto principal del tutor.
    expect(familyAccessCommandSchema.safeParse({ ...scope, action: "invite", guardianId: GUARDIAN, grantViewAthletes: true, email: "x@example.invalid" }).success).toBe(false);
    expect(familyAccessCommandSchema.safeParse({ ...scope, action: "resend", invitationId: GUARDIAN, revision: 0 }).success).toBe(false);
    expect(familyAccessCommandSchema.safeParse({ ...scope, action: "delete_everything" }).success).toBe(false);
  });

  it("el token tiene la forma exacta de 32 bytes en base64url", () => {
    expect(familyTokenSchema.safeParse("a".repeat(43)).success).toBe(true);
    expect(familyTokenSchema.safeParse("a".repeat(42)).success).toBe(false);
    expect(familyTokenSchema.safeParse(`${"a".repeat(42)}=`).success).toBe(false);
  });

  it("el aviso manual va a una clase o a un grupo, con título y texto acotados", () => {
    const base = { organizationId: ORG, locationId: SITE, title: "Entreno abierto", body: "El sábado hay puertas abiertas." };
    expect(manualNoticeCommandSchema.safeParse({ ...base, target: { kind: "class", classTemplateId: GUARDIAN } }).success).toBe(true);
    expect(manualNoticeCommandSchema.safeParse({ ...base, target: { kind: "group", groupId: GUARDIAN } }).success).toBe(true);
    expect(manualNoticeCommandSchema.safeParse({ ...base, target: { kind: "family", familyId: GUARDIAN } }).success).toBe(false);
    expect(manualNoticeCommandSchema.safeParse({ ...base, title: "x".repeat(141), target: { kind: "group", groupId: GUARDIAN } }).success).toBe(false);
    expect(manualNoticeCommandSchema.safeParse({ ...base, body: "x".repeat(2001), target: { kind: "group", groupId: GUARDIAN } }).success).toBe(false);
    expect(manualNoticeCommandSchema.safeParse({ ...base, body: "  ", target: { kind: "group", groupId: GUARDIAN } }).success).toBe(false);
  });

  it("un cambio de sesión exige fin posterior al inicio y como mucho 12 horas", () => {
    const base = { organizationId: ORG, locationId: SITE, reason: null };
    expect(sessionChangeCommandSchema.safeParse({ ...base, action: "cancel" }).success).toBe(true);
    expect(sessionChangeCommandSchema.safeParse({ ...base, action: "reschedule", startsAt: "2026-11-20T17:00:00Z", endsAt: "2026-11-20T18:30:00Z" }).success).toBe(true);
    expect(sessionChangeCommandSchema.safeParse({ ...base, action: "reschedule", startsAt: "2026-11-20T17:00:00Z", endsAt: "2026-11-20T17:00:00Z" }).success).toBe(false);
    expect(sessionChangeCommandSchema.safeParse({ ...base, action: "reschedule", startsAt: "2026-11-20T05:00:00Z", endsAt: "2026-11-20T18:00:00Z" }).success).toBe(false);
    expect(sessionChangeCommandSchema.safeParse({ ...base, action: "reschedule", startsAt: "mañana", endsAt: "2026-11-20T18:00:00Z" }).success).toBe(false);
  });

  it("preferencias y lecturas tienen forma cerrada", () => {
    expect(familyPreferencesSchema.safeParse({ organizationId: ORG, emailSessionChanges: true, emailManualNotices: false }).success).toBe(true);
    expect(familyPreferencesSchema.safeParse({ organizationId: ORG, emailSessionChanges: true, emailManualNotices: false, guardianId: GUARDIAN }).success).toBe(false);
    expect(markNoticesReadSchema.safeParse({ noticeIds: [] }).success).toBe(false);
    expect(markNoticesReadSchema.safeParse({ noticeIds: Array.from({ length: 51 }, () => GUARDIAN) }).success).toBe(false);
  });
});

describe("textos de avisos", () => {
  const session = {
    className: "Base 3 GAF",
    locationName: "Sede Norte",
    timeZone: "Europe/Madrid",
    startsAt: new Date("2026-11-20T16:30:00Z"),
    endsAt: new Date("2026-11-20T18:00:00Z"),
  };

  it("cancelación con la hora local de la sede y el motivo opcional", () => {
    const text = sessionNoticeText({ ...session, kind: "session_cancelled", reason: "Competición del club" });
    expect(text.title).toBe("Sesión cancelada: Base 3 GAF");
    expect(text.body).toContain("Base 3 GAF (Sede Norte)");
    expect(text.body).toContain("17:30");
    expect(text.body).toContain("19:00");
    expect(text.body).toContain("Motivo: Competición del club");
  });

  it("cambio de horario con la hora nueva", () => {
    const text = sessionNoticeText({
      ...session,
      kind: "session_rescheduled",
      newStartsAt: new Date("2026-11-21T09:00:00Z"),
      newEndsAt: new Date("2026-11-21T10:30:00Z"),
      reason: null,
    });
    expect(text.body).toContain("pasa al");
    expect(text.body).toContain("10:00");
    expect(text.body).not.toContain("Motivo");
    expect(() => sessionNoticeText({ ...session, kind: "session_rescheduled" })).toThrow();
  });

  it("la sustitución no nombra a nadie ni copia el motivo interno", () => {
    const text = sessionNoticeText({ ...session, kind: "session_substitution", reason: "Baja médica de Ana" });
    expect(text.body).not.toContain("Ana");
    expect(text.body).not.toContain("médica");
    expect(text.body).toContain("otra persona del equipo");
  });

  it("el título nunca supera 140 caracteres", () => {
    const text = sessionNoticeText({ ...session, className: "x".repeat(300), kind: "session_cancelled" });
    expect(text.title.length).toBeLessThanOrEqual(140);
  });
});

describe("correos", () => {
  const token = "b".repeat(43);

  it("el enlace lleva el token en el fragmento, nunca en la ruta ni en la consulta", () => {
    const url = familyInvitationUrl("https://zaltyko.com/", token);
    expect(url).toBe(`https://zaltyko.com/familia/aceptar#token=${token}`);
    const parsed = new URL(url);
    expect(parsed.search).toBe("");
    expect(parsed.pathname).toBe("/familia/aceptar");
  });

  it("la invitación nombra la academia y escapa el HTML", () => {
    const email = familyInvitationEmail({ academyName: "Club <Gim>", url: familyInvitationUrl("https://zaltyko.com", token), expiresAt: new Date("2026-11-21T10:00:00Z") });
    expect(email.subject).toBe("Club <Gim> te invita a su portal de familias");
    expect(email.html).toContain("Club &lt;Gim&gt;");
    expect(email.html).not.toContain("<Gim>");
    expect(email.text).toContain("caduca el");
    expect(email.text).toContain(`#token=${token}`);
  });

  it("el aviso manual lleva un asunto genérico: el título libre no queda en el registro de envíos", () => {
    const email = familyNoticeEmail({ academyName: "Club", kind: "manual", title: "Ana y Bea, uniforme", body: "Traed el maillot.", portalUrl: "https://zaltyko.com/familia/avisos" });
    expect(email.subject).toBe("Club: tienes un aviso nuevo");
    expect(email.text.startsWith("Ana y Bea, uniforme")).toBe(true);
  });

  it("el aviso enlaza al portal e incluye cómo desactivar el correo", () => {
    const email = familyNoticeEmail({ academyName: "Club", kind: "session_cancelled", title: "Sesión cancelada: Base", body: "Línea 1\nLínea <2>", portalUrl: "https://zaltyko.com/familia/avisos" });
    expect(email.subject).toBe("Club: Sesión cancelada: Base");
    expect(email.html).toContain("Línea &lt;2&gt;");
    expect(email.text).toContain("desactivar estos correos");
    expect(email.html).toContain("https://zaltyko.com/familia/avisos");
  });

  it("cada tipo de aviso respeta su preferencia", () => {
    const off = { emailSessionChanges: false, emailManualNotices: true };
    expect(noticeEmailAllowed("session_cancelled", off)).toBe(false);
    expect(noticeEmailAllowed("session_substitution", off)).toBe(false);
    expect(noticeEmailAllowed("manual", off)).toBe(true);
    expect(noticeEmailAllowed("manual", { emailSessionChanges: true, emailManualNotices: false })).toBe(false);
  });
});

describe("claves de aviso", () => {
  it("el mismo cambio da la misma clave y otro cambio otra", () => {
    expect(noticeDedupeKey(["s", "cancelled"])).toBe(noticeDedupeKey(["s", "cancelled"]));
    expect(noticeDedupeKey(["s", "cancelled"])).not.toBe(noticeDedupeKey(["s", "rescheduled", "a", "b"]));
    expect(noticeDedupeKey(["s", "rescheduled", "a", "b"])).not.toBe(noticeDedupeKey(["s", "rescheduled", "a", "c"]));
    expect(noticeDedupeKey(["x"])).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

describe("hora local de la sede", () => {
  it("convierte la hora de pared de Madrid en invierno y en verano", () => {
    expect(zonedWallTimeToUtc("2026-11-20", "18:30", "Europe/Madrid")?.toISOString()).toBe("2026-11-20T17:30:00.000Z");
    expect(zonedWallTimeToUtc("2026-07-01", "18:30", "Europe/Madrid")?.toISOString()).toBe("2026-07-01T16:30:00.000Z");
  });

  it("convierte la hora de Ciudad de México (sin horario de verano)", () => {
    expect(zonedWallTimeToUtc("2026-11-20", "16:00", "America/Mexico_City")?.toISOString()).toBe("2026-11-20T22:00:00.000Z");
  });

  it("rechaza entradas mal formadas", () => {
    expect(zonedWallTimeToUtc("20-11-2026", "18:30", "Europe/Madrid")).toBeNull();
    expect(zonedWallTimeToUtc("2026-11-20", "25:00", "Europe/Madrid")).toBeNull();
    expect(zonedWallTimeToUtc("2026-11-20", "18:30", "Mars/Olympus")).toBeNull();
  });

  it("ida y vuelta con la hora de pared", () => {
    const instant = new Date("2026-11-20T17:30:00.000Z");
    expect(utcToZonedWallTime(instant, "Europe/Madrid")).toEqual({ date: "2026-11-20", time: "18:30" });
    const wall = utcToZonedWallTime(instant, "America/Mexico_City");
    expect(zonedWallTimeToUtc(wall.date, wall.time, "America/Mexico_City")?.toISOString()).toBe(instant.toISOString());
  });
});
