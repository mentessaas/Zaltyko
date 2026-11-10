/**
 * P2 #16 · Portal de familias: aislamiento con base sintética.
 *
 * Se ejecutan de verdad la resolución del acceso, las lecturas y las páginas
 * de /familia. Solo se simulan la sesión de Supabase y la base de datos, que
 * responde a las consultas del portal y anota el SQL y los parámetros de cada
 * lectura de datos. Una familia:
 *  - solo ve sus gimnastas vigentes y las cuotas de las familias que paga;
 *  - recibe 404, sin leer ninguna tabla de datos, con gimnastas de otra
 *    familia (misma academia, otra sede), de otra academia, de una academia
 *    cerrada, de una familia inactiva, dadas de baja, futuras, archivadas,
 *    inexistentes o con ids mal formados;
 *  - nunca enlaza un id que no salga de su propio acceso, y cada consulta
 *    lleva la cadena canónica completa ligada a su usuario de sesión.
 * La prueba contra PostgreSQL real está en family-portal-isolation-pg.test.ts.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { PgDialect } from "drizzle-orm/pg-core";
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
  familyCanViewAthlete,
  familyCanViewFees,
} from "@/modules/family-portal/application/family-portal-sql";
import {
  getFamilyAthleteAttendance,
  getFamilyAthleteOverview,
  getFamilyAthleteSchedule,
  getFamilyFees,
} from "@/modules/family-portal/application/family-portal-reads";
import { enrollments, invoices } from "@/db/zaltyko-schema";
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

/** Every domain read carries the canonical chain bound to this user. */
function expectChainOnEveryRead(userId: string) {
  expect(state.domainReads.length).toBeGreaterThan(0);
  for (const read of state.domainReads) {
    expect(read.params, read.table).toContain(userId);
    expect(read.sql, read.table).toContain("fp_g.auth_user_id = ");
    expect(read.sql, read.table).toContain("fp_g.is_active");
    expect(read.sql, read.table).toContain("fp_o.status in ('trial', 'active')");
    expect(read.sql, read.table).toContain("fp_fg.is_active");
    expect(read.sql, read.table).toContain("fp_f.is_active");
  }
}

async function expectNotFound(promise: Promise<unknown>) {
  await expect(promise).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
}

describe("guardas SQL", () => {
  const dialect = new PgDialect();

  it("la guarda de gimnasta exige la cadena completa, la vigencia y el inicio", () => {
    const query = dialect.sqlToQuery(
      familyCanViewAthlete({
        userId: ids.userFamilyA,
        now: NOW,
        organizationRef: enrollments.organizationId,
        athleteRef: enrollments.athleteId,
        sinceRef: enrollments.createdAt,
      })
    );
    const text = query.sql.replace(/\s+/g, " ");
    for (const fragment of [
      "fp_g.auth_user_id = $1::uuid",
      "fp_g.is_active",
      "fp_o.status in ('trial', 'active')",
      "fp_fg.is_active",
      "fp_fg.can_view_athletes",
      "fp_f.is_active",
      "fp_a.is_active",
      "fp_fm.starts_on <=",
      "fp_fm.ends_on is null or fp_fm.ends_on >=",
      "at time zone fp_o.default_timezone",
      "fp_fm.starts_on::timestamp at time zone fp_o.default_timezone",
    ]) {
      expect(text).toContain(fragment);
    }
    // Drizzle may qualify the outer columns with the zaltyko schema.
    expect(text).toMatch(/fp_g\.organization_id = (?:"zaltyko"\.)?"enrollments"\."organization_id"/);
    expect(text).toMatch(/fp_fm\.athlete_id = (?:"zaltyko"\.)?"enrollments"\."athlete_id"/);
    expect(text).toMatch(/and (?:"zaltyko"\.)?"enrollments"\."created_at" >= \(fp_fm\.starts_on/);
    expect(query.params).toEqual([ids.userFamilyA, NOW.toISOString(), NOW.toISOString()]);
  });

  it("la guarda de cuotas exige un pagador vigente del mismo tutor", () => {
    const text = dialect
      .sqlToQuery(
        familyCanViewFees({
          userId: ids.userFamilyA,
          now: NOW,
          organizationRef: invoices.organizationId,
          familyRef: invoices.familyId,
        })
      )
      .sql.replace(/\s+/g, " ");
    for (const fragment of [
      "join zaltyko.family_payers fp_p",
      "fp_p.guardian_id = fp_fg.guardian_id",
      "fp_p.starts_on <=",
      "fp_p.ends_on is null or fp_p.ends_on >=",
      "fp_fg.is_active",
      "fp_f.is_active",
    ]) {
      expect(text).toContain(fragment);
    }
    expect(text).toMatch(/fp_fg\.family_id = (?:"zaltyko"\.)?"invoices"\."family_id"/);
  });
});

describe("resolveFamilyPortalAccess", () => {
  it("la familia A ve solo a Ana: ni bajas, ni futuras, ni archivadas, ni otras familias o academias", async () => {
    const access = await resolveFamilyPortalAccess({ userId: ids.userFamilyA, now: NOW });

    expect(access.academies).toEqual([
      {
        organizationId: ids.orgA,
        organizationName: "Club Sintético",
        timezone: "Europe/Madrid",
        defaultCurrency: "EUR",
        feeFamilyIds: [ids.familyA],
        athletes: [{ athleteId: ids.ana, displayName: "Ana Sintética", visibleSince: "2026-09-01" }],
      },
    ]);
    // Access resolution never touches schedule, attendance or ledger tables.
    expect(state.domainReads).toEqual([]);
    expect(state.linkLookups[0].sql).toContain("starts_on");
  });

  it("la familia B ve solo lo suyo en su academia", async () => {
    const access = await resolveFamilyPortalAccess({ userId: ids.userFamilyB, now: NOW });
    expect(access.academies.map((item) => item.organizationId)).toEqual([ids.orgB]);
    expect(access.academies[0].athletes).toEqual([
      { athleteId: ids.dani, displayName: "Dani Otro", visibleSince: "2026-09-01" },
    ]);
  });

  it("una cuenta sin tutor canónico no tiene academias y no consulta vínculos", async () => {
    const access = await resolveFamilyPortalAccess({ userId: ids.userStranger, now: NOW });
    expect(access.academies).toEqual([]);
    expect(state.linkLookups).toEqual([]);
    expect(state.payerLookups).toEqual([]);
    expect(state.guardianLookups[0].params).toContain(ids.userStranger);
  });

  it.each([
    ["academia cerrada", ids.userClosed],
    ["vínculo inactivo", ids.userInactiveLink],
    ["tutor inactivo", ids.userInactiveGuardian],
    ["familia inactiva", ids.userInactiveFamily],
    ["sin permiso de ver gimnastas ni pagador", ids.userNoViewNoPay],
    ["pagador con baja y sin permiso de ver gimnastas", ids.userPayerEnded],
  ])("%s: no muestra ninguna academia", async (_label, userId) => {
    const access = await resolveFamilyPortalAccess({ userId, now: NOW });
    expect(access.academies).toEqual([]);
  });

  it("un pagador sin permiso para ver gimnastas solo ve las cuotas", async () => {
    const access = await resolveFamilyPortalAccess({ userId: ids.userNoViewPayer, now: NOW });
    expect(access.academies).toEqual([
      expect.objectContaining({ organizationId: ids.orgA, feeFamilyIds: [ids.familyA], athletes: [] }),
    ]);
    await expectNotFound(
      getFamilyAthleteSchedule({ userId: ids.userNoViewPayer, athleteId: ids.ana, now: NOW })
    );
    expect(state.domainReads).toEqual([]);
  });
});

describe("lecturas de la familia A", () => {
  it.each([
    ["otra familia de la misma academia y otra sede", ids.carla],
    ["otra academia", ids.dani],
    ["una academia cerrada", ids.olga],
    ["una familia inactiva", ids.ines],
    ["un miembro dado de baja", ids.bruno],
    ["un miembro que aún no ha empezado", ids.fede],
    ["una gimnasta archivada", ids.eva],
    ["un id inexistente", ids.unknown],
    ["un id mal formado", "../../owner"],
  ])("con %s responde 404 sin leer datos", async (_label, athleteId) => {
    const userId = ids.userFamilyA;
    await expectNotFound(getFamilyAthleteSchedule({ userId, athleteId, now: NOW }));
    await expectNotFound(getFamilyAthleteAttendance({ userId, athleteId, now: NOW }));
    await expectNotFound(getFamilyAthleteOverview({ userId, athleteId, now: NOW }));
    expect(state.domainReads).toEqual([]);
  });

  it("el horario de Ana solo enlaza su academia, su gimnasta y su clase", async () => {
    const schedule = await getFamilyAthleteSchedule({
      userId: ids.userFamilyA,
      athleteId: ids.ana,
      now: NOW,
    });

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
    for (const read of state.domainReads) {
      expect(read.params).toContain(ids.orgA);
      expect(read.sql).toContain("fp_fg.can_view_athletes");
    }
    expect(state.domainReads[0].params).toContain(ids.ana);
    expect(state.domainReads[2].sql).toContain("fp_fm.starts_on::timestamp at time zone");
    expectChainOnEveryRead(ids.userFamilyA);
    const bound = boundStrings();
    for (const foreign of FOREIGN_TO_FAMILY_A) expect(bound).not.toContain(foreign);
  });

  it("la asistencia de Ana no incluye marcas de otras gimnastas", async () => {
    const attendance = await getFamilyAthleteAttendance({
      userId: ids.userFamilyA,
      athleteId: ids.ana,
      now: NOW,
    });

    expect(attendance.entries).toEqual([
      expect.objectContaining({ recordId: ids.attendanceAna, status: "late", className: "Iniciación" }),
    ]);
    expect(state.domainReads).toHaveLength(1);
    expect(state.domainReads[0]).toMatchObject({ table: "attendance_records" });
    expect(state.domainReads[0].params).toEqual(expect.arrayContaining([ids.orgA, ids.ana]));
    expect(state.domainReads[0].sql).toContain("fp_fm.starts_on::timestamp at time zone");
    expectChainOnEveryRead(ids.userFamilyA);
    const bound = boundStrings();
    for (const foreign of FOREIGN_TO_FAMILY_A) expect(bound).not.toContain(foreign);
  });

  it("la familia B no ve la asistencia anterior a su vínculo con Dani", async () => {
    const attendance = await getFamilyAthleteAttendance({
      userId: ids.userFamilyB,
      athleteId: ids.dani,
      now: NOW,
    });
    expect(attendance.athlete.visibleSince).toBe("2026-09-01");
    expect(attendance.entries.map((entry) => entry.recordId)).toEqual([ids.attendanceDani]);
  });

  it("las cuotas solo son las de la familia que paga, con pagado neto y pendiente", async () => {
    const fees = await getFamilyFees({ userId: ids.userFamilyA, now: NOW });

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
            refundedCents: 500,
            pendingCents: 2000,
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
    expect(state.domainReads[0].sql).toContain("join zaltyko.family_payers fp_p");
    expectChainOnEveryRead(ids.userFamilyA);
    const bound = boundStrings();
    for (const foreign of FOREIGN_TO_FAMILY_A) expect(bound).not.toContain(foreign);
  });

  it("un tutor que no paga no consulta ninguna cuota", async () => {
    expect(await getFamilyFees({ userId: ids.userNoViewNoPay, now: NOW })).toEqual([]);
    expect(await getFamilyFees({ userId: ids.userStranger, now: NOW })).toEqual([]);
    expect(state.domainReads).toEqual([]);
  });

  it("la cuota pagada de la familia B queda a cero pendiente y en su moneda", async () => {
    const [academy] = await getFamilyFees({ userId: ids.userFamilyB, now: NOW });
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
    expect(html).toMatch(/Datos desde el 1 sept?\.? 2026/);
    for (const foreign of ["Carla", "Base 3", "Sede Sur", "Dani", "Bruno", "Fede", "Otro Club"]) {
      expect(html).not.toContain(foreign);
    }
  });

  it("la portada lista solo a sus gimnastas", async () => {
    holder.userId = ids.userFamilyA;
    const html = await render(FamilyPortalHomePage());
    expect(html).toContain("Tu familia");
    expect(html).toContain(`/familia/gimnastas/${ids.ana}`);
    for (const foreign of [ids.carla, ids.dani, ids.bruno, ids.eva, ids.fede, "Carla", "Otro Club"]) {
      expect(html).not.toContain(foreign);
    }
  });

  it("una cuenta sin vínculo ve un aviso neutro", async () => {
    holder.userId = ids.userStranger;
    const html = await render(FamilyPortalHomePage());
    expect(html).toContain("Aún no hay datos que mostrar");
    expect(html).not.toContain("Club Sintético");
  });

  it("un tutor que ni ve gimnastas ni paga no ve la academia ni el enlace a cuotas", async () => {
    holder.userId = ids.userNoViewNoPay;
    const html = await render(FamilyPortalHomePage());
    expect(html).toContain("Aún no hay datos que mostrar");
    expect(html).not.toContain("Club Sintético");
    expect(html).not.toContain("Ver cuotas");
  });

  it("las cuotas informan sin ofrecer ningún pago", async () => {
    holder.userId = ids.userFamilyA;
    const html = await render(FamilyFeesPage());
    expect(html).toContain("Cuota CUO-2026-11-A");
    expect(html).toContain("Pagada en parte");
    expect(html).toContain("Devuelto");
    expect(html).toContain("El pago se gestiona directamente con tu academia");
    expect(html).not.toContain("CUO-2026-11-A2");
    expect(html).not.toContain("CUO-2026-11-B");
    expect(html).not.toMatch(/<form/i);
    expect(html).not.toMatch(/stripe|pagar ahora|paga ahora|tarjeta|domicilia/i);
    // The only button on the page is the sign-out control.
    expect(html.match(/<button/g) ?? []).toHaveLength(1);
  });
});
