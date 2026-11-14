// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const motionState = vi.hoisted(() => ({
  reduce: false,
  calls: [] as Array<{ variants: any; transition: any; custom: any }>,
}));

// Sin animaciones reales: se conserva lo que la pantalla le pide a framer-motion
// para comprobar el movimiento reducido sin depender de temporizadores.
vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, variants, transition, custom, initial: _i, animate: _a, exit: _e, ...rest }: any) => {
      motionState.calls.push({ variants, transition, custom });
      return <div {...rest}>{children}</div>;
    },
  },
  useReducedMotion: () => motionState.reduce,
}));

import { OwnerCalendarView } from "@/components/owner-dashboard/OwnerCalendarView";
import {
  calendarApiParams,
  calendarSearchParams,
  coachLine,
  groupsLine,
  isOverCapacity,
  occupancyLabel,
  occupancyPercent,
  parseCalendarSearch,
  sessionAttendanceHref,
} from "@/components/owner-dashboard/owner-calendar-ui";
import type {
  OwnerCalendarData,
  OwnerCalendarSession,
} from "@/modules/scheduling/application/calendar-sessions";

const organizationId = "10000000-0000-4000-8000-000000000001";
const madrid = "20000000-0000-4000-8000-000000000002";
const cdmx = "20000000-0000-4000-8000-000000000003";
const groupId = "30000000-0000-4000-8000-000000000004";
const TODAY = "2026-11-14";

function session(overrides: Partial<OwnerCalendarSession>): OwnerCalendarSession {
  return {
    id: "40000000-0000-4000-8000-0000000000a1",
    status: "scheduled",
    startsAt: "2026-11-14T16:00:00Z",
    endsAt: "2026-11-14T17:30:00Z",
    timezone: "Europe/Madrid",
    locationId: madrid,
    locationName: "Sede Centro",
    classTemplateId: "50000000-0000-4000-8000-000000000001",
    className: "Artística base",
    programName: "Gimnasia artística",
    groups: [{ id: groupId, name: "Pre-equipo" }],
    capacity: 15,
    expectedAthletes: 12,
    recordedAttendance: 0,
    coachNames: ["Ana Pérez"],
    substitution: false,
    ...overrides,
  };
}

const saturday = session({});
const cancelled = session({
  id: "40000000-0000-4000-8000-0000000000a2",
  startsAt: "2026-11-14T10:00:00Z",
  endsAt: "2026-11-14T11:00:00Z",
  className: "Rítmica iniciación",
  programName: "Gimnasia rítmica",
  status: "cancelled",
  groups: [],
});
const monday = session({
  id: "40000000-0000-4000-8000-0000000000a3",
  startsAt: "2026-11-09T17:00:00Z",
  endsAt: "2026-11-09T18:30:00Z",
  className: "Competición GAF",
  capacity: 16,
  expectedAthletes: 18,
  recordedAttendance: 10,
  substitution: true,
  coachNames: ["Luis Gómez"],
  groups: [],
});

function data(sessions: OwnerCalendarSession[], from = "2026-11-09", to = "2026-11-15"): OwnerCalendarData {
  return {
    range: { from, to },
    sessions,
    truncated: false,
    locations: [
      { id: madrid, name: "Sede Centro", timezone: "Europe/Madrid" },
      { id: cdmx, name: "Sede CDMX", timezone: "America/Mexico_City" },
    ],
    groups: [{ id: groupId, name: "Pre-equipo", locationId: madrid }],
    coachesAvailable: true,
  };
}

const fetchMock = vi.fn();

function respondWith(value: OwnerCalendarData) {
  fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true, data: value }) });
}

function renderView(
  overrides: Partial<React.ComponentProps<typeof OwnerCalendarView>> = {}
) {
  return render(
    <OwnerCalendarView
      organizationId={organizationId}
      initialState={{ view: "week", date: TODAY, locationId: "", groupId: "" }}
      locations={data([]).locations}
      referenceTimeZone="Europe/Madrid"
      todayLocal={TODAY}
      initialData={data([saturday, cancelled, monday])}
      {...overrides}
    />
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-14T10:00:00Z"));
  motionState.reduce = false;
  motionState.calls.length = 0;
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("OwnerCalendarView · semana", () => {
  it("muestra cada sesión con hora de su sede, clase, grupo, entrenadora, ocupación y estado", () => {
    renderView();

    expect(screen.getByRole("heading", { level: 1, name: "Calendario" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "9–15 nov 2026" })).toBeInTheDocument();
    // Los datos iniciales vienen del servidor: no hace falta pedirlos otra vez.
    expect(fetchMock).not.toHaveBeenCalled();

    const sat = screen.getByRole("region", { name: "Sábado, 14 de noviembre" });
    expect(within(sat).getByText("Hoy")).toBeInTheDocument();
    expect(within(sat).getByText("17:00–18:30")).toBeInTheDocument();
    expect(within(sat).getByText("Artística base")).toBeInTheDocument();
    // Con varias sedes a la vista, la sede acompaña al grupo.
    expect(within(sat).getByText("Pre-equipo · Sede Centro")).toBeInTheDocument();
    expect(within(sat).getByText("Entrena: Ana Pérez")).toBeInTheDocument();
    expect(within(sat).getByText("12/15 inscritas")).toBeInTheDocument();
    expect(within(sat).getByText("12 inscritas de 15 plazas")).toBeInTheDocument();

    const open = within(sat).getByRole("link", { name: "Abrir la asistencia de Artística base a las 17:00" });
    expect(open).toHaveAttribute(
      "href",
      `/owner/attendance?organizationId=${organizationId}&locationId=${madrid}&sessionId=${saturday.id}`
    );
  });

  it("marca las canceladas sin enlace y las sustituciones y listas pasadas con su etiqueta", () => {
    renderView();

    const sat = screen.getByRole("region", { name: "Sábado, 14 de noviembre" });
    expect(within(sat).getByText("Cancelada")).toBeInTheDocument();
    expect(within(sat).getByText("Rítmica iniciación")).toHaveClass("line-through");
    expect(within(sat).queryByRole("link", { name: /Rítmica iniciación/ })).toBeNull();

    const mon = screen.getByRole("region", { name: "Lunes, 9 de noviembre" });
    expect(within(mon).getByText("Sustitución")).toBeInTheDocument();
    expect(within(mon).getByText("Lista pasada")).toBeInTheDocument();
    expect(within(mon).getByText("Entrena: Luis Gómez")).toBeInTheDocument();
    // 18 inscritas en 16 plazas: la ocupación se rotula, sin esconder el dato.
    expect(within(mon).getByText("18/16 inscritas")).toBeInTheDocument();
  });

  it("los días sin sesiones lo dicen y no se pinta ninguno vacío sin texto", () => {
    renderView();

    const tuesday = screen.getByRole("region", { name: "Martes, 10 de noviembre" });
    expect(within(tuesday).getByText("Sin sesiones")).toBeInTheDocument();
    expect(screen.getAllByRole("region")).toHaveLength(7);
  });

  it("si las entrenadoras no se pudieron leer, no afirma que no haya nadie", () => {
    renderView({
      initialData: data([session({ coachNames: undefined, substitution: undefined })]),
    });

    expect(screen.queryByText(/Sin entrenadora asignada/)).toBeNull();
    expect(screen.queryByText(/Entrena:/)).toBeNull();
  });

  it("con la lectura inicial fallida la pide ella misma y enseña el error con «Reintentar»", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ detail: "Demasiadas peticiones." }),
    });
    renderView({ initialData: null });

    expect(await screen.findByRole("alert")).toHaveTextContent("Demasiadas peticiones.");
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
    expect(String(fetchMock.mock.calls[0][0])).toContain("/api/v1/owner/calendar?");

    respondWith(data([saturday]));
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("Artística base")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("OwnerCalendarView · navegación y filtros", () => {
  it("«Semana siguiente» pide el rango siguiente y «Hoy» vuelve al actual sin red (caché)", async () => {
    respondWith(data([], "2026-11-16", "2026-11-22"));
    renderView();

    fireEvent.click(screen.getByRole("button", { name: "Semana siguiente" }));
    expect(await screen.findByRole("heading", { level: 2, name: "16–22 nov 2026" })).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const url = new URL(String(fetchMock.mock.calls[0][0]), "https://example.invalid");
    expect(url.pathname).toBe("/api/v1/owner/calendar");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      organizationId,
      from: "2026-11-16",
      to: "2026-11-22",
    });
    expect(screen.queryByText("Artística base")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Hoy" }));
    expect(await screen.findByRole("heading", { level: 2, name: "9–15 nov 2026" })).toBeInTheDocument();
    expect(screen.getByText("Artística base")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Semana anterior" }));
    expect(await screen.findByRole("heading", { level: 2, name: "2–8 nov 2026" })).toBeInTheDocument();
  });

  it("filtrar por sede y por grupo vuelve a pedir el rango con ese filtro", async () => {
    respondWith(data([saturday]));
    renderView();

    fireEvent.change(screen.getByLabelText("Sede"), { target: { value: madrid } });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(new URL(String(fetchMock.mock.calls[0][0]), "https://example.invalid").searchParams.get("locationId")).toBe(
      madrid
    );

    fireEvent.change(screen.getByLabelText("Grupo"), { target: { value: groupId } });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const params = new URL(String(fetchMock.mock.calls[1][0]), "https://example.invalid").searchParams;
    expect(params.get("locationId")).toBe(madrid);
    expect(params.get("groupId")).toBe(groupId);
  });

  it("al cambiar a una sede que no tiene el grupo elegido, el grupo se quita", async () => {
    respondWith(data([]));
    renderView({ initialState: { view: "week", date: TODAY, locationId: madrid, groupId } });

    fireEvent.change(screen.getByLabelText("Sede"), { target: { value: cdmx } });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const params = new URL(String(fetchMock.mock.calls.at(-1)![0]), "https://example.invalid").searchParams;
    expect(params.get("locationId")).toBe(cdmx);
    expect(params.has("groupId")).toBe(false);
  });

  it("con una sola sede no ofrece el filtro de sede", () => {
    renderView({ locations: [data([]).locations[0]] });

    expect(screen.queryByLabelText("Sede")).toBeNull();
    expect(screen.getByLabelText("Grupo")).toBeInTheDocument();
  });
});

describe("OwnerCalendarView · día y mes", () => {
  it("la vista Día lista las sesiones del día en filas, con su enlace a la asistencia", async () => {
    respondWith(data([saturday, cancelled], TODAY, TODAY));
    renderView();

    fireEvent.click(screen.getByRole("button", { name: "Día" }));
    expect(await screen.findByRole("heading", { level: 2, name: "Sábado, 14 de noviembre de 2026" })).toBeInTheDocument();
    const list = await screen.findByRole("region", { name: "Sábado, 14 de noviembre" });
    await waitFor(() => expect(within(list).getAllByRole("listitem")).toHaveLength(2));
    expect(within(list).getAllByRole("link")).toHaveLength(1);
  });

  it("la vista Mes dibuja la rejilla, cuenta las sesiones por día y abre el día elegido debajo", async () => {
    respondWith(data([saturday, cancelled, monday], "2026-10-26", "2026-12-06"));
    renderView();

    fireEvent.click(screen.getByRole("button", { name: "Mes" }));
    expect(await screen.findByRole("heading", { level: 2, name: "Noviembre de 2026" })).toBeInTheDocument();
    const saturdayCell = await screen.findByRole("button", { name: "Sábado, 14 de noviembre: 2 sesiones" });
    expect(saturdayCell).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Lunes, 9 de noviembre: 1 sesión" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Martes, 10 de noviembre: sin sesiones" })).toBeInTheDocument();
    // 6 semanas × 7 días.
    expect(screen.getAllByRole("button", { name: /: (sin sesiones|\d+ sesi)/ })).toHaveLength(42);

    expect(screen.getByRole("heading", { level: 3, name: "Sábado, 14 de noviembre" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Lunes, 9 de noviembre: 1 sesión" }));
    expect(screen.getByRole("heading", { level: 3, name: "Lunes, 9 de noviembre" })).toBeInTheDocument();
    expect(screen.getAllByText("Competición GAF").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Ver el día" }));
    expect(await screen.findByRole("heading", { level: 2, name: "Lunes, 9 de noviembre de 2026" })).toBeInTheDocument();
  });
});

describe("OwnerCalendarView · movimiento", () => {
  it("anima la entrada y salida entre vistas, con una dirección según anterior o siguiente", async () => {
    respondWith(data([]));
    renderView();

    const last = () => motionState.calls.at(-1)!;
    expect(last().transition).toMatchObject({ duration: 0.18 });
    expect(last().variants.enter(1).x).toBe(28);
    expect(last().variants.exit(1).x).toBe(-28);

    fireEvent.click(screen.getByRole("button", { name: "Semana anterior" }));
    await waitFor(() => expect(last().custom).toBe(-1));
  });

  it("con prefers-reduced-motion no desplaza ni anima: solo cambia el contenido", () => {
    motionState.reduce = true;
    renderView();

    const last = motionState.calls.at(-1)!;
    expect(last.transition).toMatchObject({ duration: 0 });
    expect(last.variants.enter(1).x).toBe(0);
    expect(last.variants.exit(-1).x).toBe(0);
  });
});

describe("ayudas del calendario", () => {
  it("lee vista, fecha, sede y grupo de la URL y cae a lo seguro si no son válidos", () => {
    expect(
      parseCalendarSearch({ vista: "month", fecha: "2026-11-20", locationId: madrid, grupo: groupId }, TODAY)
    ).toEqual({ view: "month", date: "2026-11-20", locationId: madrid, groupId });
    expect(parseCalendarSearch({ vista: "year", fecha: "2026-02-30" }, TODAY)).toEqual({
      view: "week",
      date: TODAY,
      locationId: "",
      groupId: "",
    });
    expect(parseCalendarSearch({ vista: ["month"], fecha: ["2026-11-20"] }, TODAY).view).toBe("week");
  });

  it("escribe en la URL solo lo que se aparta de los valores por defecto", () => {
    expect(
      calendarSearchParams(organizationId, { view: "week", date: TODAY, locationId: "", groupId: "" }, TODAY)
    ).toBe(`organizationId=${organizationId}`);
    expect(
      calendarSearchParams(
        organizationId,
        { view: "month", date: "2026-11-20", locationId: madrid, groupId },
        TODAY
      )
    ).toBe(
      `organizationId=${organizationId}&locationId=${madrid}&vista=month&fecha=2026-11-20&grupo=${groupId}`
    );
  });

  it("arma la consulta de la API con el rango y los filtros presentes", () => {
    expect(
      calendarApiParams({ organizationId, from: "2026-11-09", to: "2026-11-15", locationId: "", groupId: "" })
    ).toBe(`organizationId=${organizationId}&from=2026-11-09&to=2026-11-15`);
    expect(
      calendarApiParams({ organizationId, from: "2026-11-09", to: "2026-11-15", locationId: madrid, groupId })
    ).toBe(
      `organizationId=${organizationId}&from=2026-11-09&to=2026-11-15&locationId=${madrid}&groupId=${groupId}`
    );
  });

  it("ocupación, entrenadoras, grupos y destino de asistencia", () => {
    expect(occupancyLabel(saturday)).toBe("12/15");
    expect(occupancyPercent(saturday)).toBe(80);
    expect(occupancyPercent(monday)).toBe(100);
    expect(occupancyPercent({ expectedAthletes: 3, capacity: 0 })).toBe(0);
    expect(isOverCapacity(monday)).toBe(true);
    expect(isOverCapacity(saturday)).toBe(false);
    expect(coachLine({ coachNames: ["Ana", "Luis"] })).toBe("Ana y Luis");
    expect(coachLine({ coachNames: [] })).toBe("Sin entrenadora asignada");
    expect(coachLine({ coachNames: undefined })).toBeNull();
    expect(groupsLine({ groups: [] })).toBeNull();
    expect(groupsLine({ groups: [{ id: "a", name: "A" }, { id: "b", name: "B" }] })).toBe("A, B");
    expect(sessionAttendanceHref(organizationId, saturday)).toBe(
      `/owner/attendance?organizationId=${organizationId}&locationId=${madrid}&sessionId=${saturday.id}`
    );
  });
});
