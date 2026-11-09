/**
 * P2 #16 · Portal de familias: aislamiento extremo a extremo con base sintética.
 *
 * Se ejecutan de verdad la resolución del acceso, las lecturas y las páginas
 * de /familia. Solo se simulan la sesión de Supabase y la base de datos, que
 * responde a las consultas del portal y anota cada lectura de datos con sus
 * parámetros. Una familia:
 *  - solo ve sus gimnastas vigentes y las cuotas de su familia;
 *  - recibe 404, sin leer ninguna tabla de datos, con gimnastas de otra
 *    familia (misma academia, otra sede), de otra academia, dadas de baja,
 *    archivadas, inexistentes o con ids mal formados;
 *  - nunca enlaza en una consulta un id que no salga de su propio acceso.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const holder = vi.hoisted(() => ({
  db: undefined as undefined | Record<string, unknown>,
  userId: "",
}));

vi.mock("@/db", () => ({
  db: new Proxy({}, { get: (_target, property) => holder.db?.[property as string] }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: holder.userId ? { id: holder.userId } : null },
        error: null,
      }),
    },
  }),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
  useRouter: () => ({ replace: () => undefined, refresh: () => undefined, push: () => undefined }),
  usePathname: () => "/familia",
}));

import {
  FOREIGN_TO_FAMILY_A,
  NOW,
  createFamilyPortalFakeDb,
  createFamilyPortalFakeState,
  ids,
  type FamilyPortalFakeState,
} from "./helpers/family-portal-fake-db";
import { resolveFamilyPortalAccess } from "@/modules/family-portal/application/family-portal-access";
import {
  getFamilyAthleteAttendance,
  getFamilyAthleteSchedule,
  getFamilyFees,
} from "@/modules/family-portal/application/family-portal-reads";
import FamilyPortalHomePage from "@/app/familia/page";
import FamilyAthletePage from "@/app/familia/gimnastas/[athleteId]/page";
import FamilyFeesPage from "@/app/familia/cuotas/page";

let state: FamilyPortalFakeState;

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
  state = createFamilyPortalFakeState();
  holder.db = createFamilyPortalFakeDb(state) as unknown as Record<string, unknown>;
  holder.userId = "";
  return () => vi.useRealTimers();
});

function boundStrings(): string[] {
  return state.domainReads.flatMap((read) =>
    read.params.filter((value): value is string => typeof value === "string")
  );
}

async function expectNotFound(promise: Promise<unknown>) {
  await expect(promise).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
}

describe("resolveFamilyPortalAccess", () => {
  it("la familia A ve solo a Ana: ni bajas, ni archivadas, ni otras familias o academias", async () => {
    const access = await resolveFamilyPortalAccess({ userId: ids.userFamilyA, now: NOW });

    expect(access.academies).toEqual([
      {
        organizationId: ids.orgA,
        organizationName: "Club Sintético",
        timezone: "Europe/Madrid",
        defaultCurrency: "EUR",
        familyIds: [ids.familyA],
        athletes: [{ athleteId: ids.ana, displayName: "Ana Sintética" }],
      },
    ]);
    // Access resolution never touches schedule, attendance or ledger tables.
    expect(state.domainReads).toEqual([]);
  });

  it("la familia B ve solo lo suyo en su academia", async () => {
    const access = await resolveFamilyPortalAccess({ userId: ids.userFamilyB, now: NOW });
    expect(access.academies.map((item) => item.organizationId)).toEqual([ids.orgB]);
    expect(access.academies[0].athletes).toEqual([
      { athleteId: ids.dani, displayName: "Dani Otro" },
    ]);
  });

  it("una cuenta sin tutor canónico no tiene academias y no consulta vínculos", async () => {
    const access = await resolveFamilyPortalAccess({ userId: ids.userStranger, now: NOW });
    expect(access.academies).toEqual([]);
    expect(state.linkLookups).toEqual([]);
    expect(state.guardianLookups[0].params).toContain(ids.userStranger);
  });

  it("una academia cerrada no muestra nada a sus familias", async () => {
    const access = await resolveFamilyPortalAccess({ userId: ids.userClosed, now: NOW });
    expect(access.academies).toEqual([]);
  });

  it("un vínculo inactivo no da acceso ni a gimnastas ni a cuotas", async () => {
    const access = await resolveFamilyPortalAccess({ userId: ids.userInactiveLink, now: NOW });
    expect(access.academies).toEqual([
      expect.objectContaining({ organizationId: ids.orgA, familyIds: [], athletes: [] }),
    ]);
  });

  it("un tutor sin permiso para ver gimnastas solo ve las cuotas de su familia", async () => {
    const access = await resolveFamilyPortalAccess({ userId: ids.userNoView, now: NOW });
    expect(access.academies[0]).toMatchObject({ familyIds: [ids.familyA], athletes: [] });
    await expectNotFound(getFamilyAthleteSchedule({ access, athleteId: ids.ana, now: NOW }));
    expect(state.domainReads).toEqual([]);
  });
});

describe("lecturas de la familia A", () => {
  async function familyA() {
    return resolveFamilyPortalAccess({ userId: ids.userFamilyA, now: NOW });
  }

  it.each([
    ["otra familia de la misma academia y otra sede", ids.carla],
    ["otra academia", ids.dani],
    ["una academia cerrada", ids.olga],
    ["un miembro dado de baja", ids.bruno],
    ["una gimnasta archivada", ids.eva],
    ["un id inexistente", ids.unknown],
    ["un id mal formado", "../../owner"],
  ])("con %s responde 404 sin leer datos", async (_label, athleteId) => {
    const access = await familyA();
    await expectNotFound(getFamilyAthleteSchedule({ access, athleteId, now: NOW }));
    await expectNotFound(getFamilyAthleteAttendance({ access, athleteId }));
    expect(state.domainReads).toEqual([]);
  });

  it("el horario de Ana solo enlaza su academia, su gimnasta y su clase", async () => {
    const access = await familyA();
    const schedule = await getFamilyAthleteSchedule({ access, athleteId: ids.ana, now: NOW });

    expect(schedule.organizationId).toBe(ids.orgA);
    expect(schedule.classes).toEqual([
      expect.objectContaining({
        classTemplateId: ids.classNorth,
        className: "Iniciación",
        locationName: "Sede Norte",
        status: "active",
        weekdays: [{ isoWeekday: 2, startsAtLocal: "17:30:00", endsAtLocal: "19:00:00" }],
      }),
    ]);
    expect(schedule.upcomingSessions.map((item) => [item.sessionId, item.status])).toEqual([
      [ids.sessionNorth, "scheduled"],
      [ids.sessionNorthCancelled, "cancelled"],
    ]);
    expect(state.domainReads.map((read) => read.table)).toEqual([
      "enrollments",
      "class_template_weekdays",
      "sessions",
    ]);
    for (const read of state.domainReads) expect(read.params).toContain(ids.orgA);
    expect(state.domainReads[0].params).toContain(ids.ana);
    const bound = boundStrings();
    for (const foreign of FOREIGN_TO_FAMILY_A) expect(bound).not.toContain(foreign);
  });

  it("la asistencia de Ana no incluye marcas de otras gimnastas", async () => {
    const access = await familyA();
    const attendance = await getFamilyAthleteAttendance({ access, athleteId: ids.ana });

    expect(attendance.entries).toEqual([
      expect.objectContaining({ recordId: ids.attendanceAna, status: "late", className: "Iniciación" }),
    ]);
    expect(state.domainReads).toHaveLength(1);
    expect(state.domainReads[0]).toMatchObject({ table: "attendance_records" });
    expect(state.domainReads[0].params).toEqual(expect.arrayContaining([ids.orgA, ids.ana]));
    const bound = boundStrings();
    for (const foreign of FOREIGN_TO_FAMILY_A) expect(bound).not.toContain(foreign);
  });

  it("las cuotas solo son las de la familia A, con lo pagado y lo pendiente", async () => {
    const access = await familyA();
    const fees = await getFamilyFees({ access });

    expect(fees).toEqual([
      {
        organizationId: ids.orgA,
        organizationName: "Club Sintético",
        timezone: "Europe/Madrid",
        fees: [
          expect.objectContaining({
            invoiceId: ids.invoiceA,
            status: "partially_paid",
            totalCents: 4500,
            paidCents: 2000,
            pendingCents: 2500,
            periodStart: "2026-11-01",
            periodEnd: "2026-11-30",
          }),
        ],
      },
    ]);
    expect(state.domainReads.map((read) => read.table)).toEqual(["invoices"]);
    expect(state.domainReads[0].params).toEqual(
      expect.arrayContaining([ids.orgA, ids.familyA, "issued", "partially_paid", "paid"])
    );
    expect(state.domainReads[0].params).not.toContain("draft");
    const bound = boundStrings();
    for (const foreign of FOREIGN_TO_FAMILY_A) expect(bound).not.toContain(foreign);
  });

  it("la cuota pagada de la familia B queda a cero pendiente y en su moneda", async () => {
    const access = await resolveFamilyPortalAccess({ userId: ids.userFamilyB, now: NOW });
    const [academy] = await getFamilyFees({ access });
    expect(academy.fees).toEqual([
      expect.objectContaining({ invoiceId: ids.invoiceB, currency: "MXN", pendingCents: 0, paidCents: 90000 }),
    ]);
    expect(boundStrings()).not.toContain(ids.familyA);
  });
});

describe("páginas de /familia", () => {
  async function render(element: Promise<React.ReactElement>) {
    return renderToStaticMarkup(await element);
  }

  it("redirige a la entrada si no hay sesión", async () => {
    await expect(FamilyPortalHomePage()).rejects.toThrow("NEXT_REDIRECT:/auth/login?next=%2Ffamilia");
    await expect(FamilyFeesPage()).rejects.toThrow("NEXT_REDIRECT:/auth/login?next=%2Ffamilia%2Fcuotas");
    expect(state.guardianLookups).toEqual([]);
  });

  it.each([
    ["otra familia", ids.carla],
    ["otra academia", ids.dani],
    ["un id inexistente", ids.unknown],
    ["un id mal formado", "no-es-un-id"],
  ])("la ficha con %s responde 404 sin leer datos", async (_label, athleteId) => {
    holder.userId = ids.userFamilyA;
    await expect(
      FamilyAthletePage({ params: Promise.resolve({ athleteId }) })
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(state.domainReads).toEqual([]);
  });

  it("la ficha propia muestra horario y asistencia sin datos de otras familias", async () => {
    holder.userId = ids.userFamilyA;
    const html = await render(
      FamilyAthletePage({ params: Promise.resolve({ athleteId: ids.ana }) })
    );
    expect(html).toContain("Ana Sintética");
    expect(html).toContain("Iniciación");
    expect(html).toContain("Sede Norte");
    expect(html).toContain("Martes, 17:30 – 19:00");
    expect(html).toContain("Llegó tarde");
    expect(html).toContain("Cancelada");
    for (const foreign of ["Carla", "Base 3", "Sede Sur", "Dani", "Bruno", "Eva", "Otro Club"]) {
      expect(html).not.toContain(foreign);
    }
  });

  it("la portada lista solo a sus gimnastas", async () => {
    holder.userId = ids.userFamilyA;
    const html = await render(FamilyPortalHomePage());
    expect(html).toContain("Tu familia");
    expect(html).toContain(`/familia/gimnastas/${ids.ana}`);
    for (const foreign of [ids.carla, ids.dani, ids.bruno, ids.eva, "Carla", "Otro Club"]) {
      expect(html).not.toContain(foreign);
    }
  });

  it("una cuenta sin vínculo ve un aviso neutro", async () => {
    holder.userId = ids.userStranger;
    const html = await render(FamilyPortalHomePage());
    expect(html).toContain("Aún no hay datos que mostrar");
    expect(html).not.toContain("Club Sintético");
  });

  it("las cuotas informan sin ofrecer ningún pago", async () => {
    holder.userId = ids.userFamilyA;
    const html = await render(FamilyFeesPage());
    expect(html).toContain("Cuota CUO-2026-11-A");
    expect(html).toContain("Pagada en parte");
    expect(html).toContain("El pago se gestiona directamente con tu academia");
    expect(html).not.toContain("CUO-2026-11-A2");
    expect(html).not.toContain("CUO-2026-11-B");
    expect(html).not.toMatch(/<form/i);
    expect(html).not.toMatch(/stripe|pagar ahora|paga ahora|tarjeta|domicilia/i);
    // The only button on the page is the sign-out control.
    expect(html.match(/<button/g) ?? []).toHaveLength(1);
  });
});
