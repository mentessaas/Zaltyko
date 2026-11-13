// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OwnerEssentialDashboard } from "@/components/owner-dashboard/OwnerEssentialDashboard";
import { OwnerSummaryHero } from "@/components/owner-dashboard/OwnerSummaryHero";
import { publishOwnerPlanUsage } from "@/components/owner-dashboard/owner-plan-usage-store";
import {
  ownerGreetingName,
  ownerSummaryNextStep,
} from "@/components/owner-dashboard/owner-summary-next-step";
import type { OwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import { buildOwnerSetupChecklist } from "@/modules/owner-dashboard/application/setup-checklist-steps";
import type { OwnerTodaySession } from "@/modules/owner-dashboard/application/today-sessions";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const organizationId = "00000000-0000-4000-8000-0000000000a1";
const locationId = "00000000-0000-4000-8000-0000000000a2";
const scopeQuery = new URLSearchParams({ organizationId, locationId }).toString();

function session(overrides: Partial<OwnerTodaySession> = {}): OwnerTodaySession {
  return {
    id: "00000000-0000-4000-8000-0000000000b1",
    status: "scheduled",
    startsAt: "2026-11-12T16:00:00.000Z",
    endsAt: "2026-11-12T17:30:00.000Z",
    timezone: "Europe/Madrid",
    locationId,
    locationName: "Sede Centro",
    className: "Base artística",
    programName: null,
    capacity: 12,
    expectedAthletes: 8,
    recordedAttendance: 0,
    ...overrides,
  };
}

function usagePayload() {
  return {
    ok: true,
    data: {
      readOnly: false,
      planCode: "free",
      resources: [
        { resource: "athletes", current: 0, limit: 30, excess: 0 },
        { resource: "groups", current: 1, limit: 5, excess: 0 },
        { resource: "classes", current: 3, limit: 10, excess: 0 },
      ],
      items: [],
      next: null,
    },
  };
}

describe("siguiente paso del hero (solo datos reales)", () => {
  it("prioriza el paso pendiente de la puesta en marcha con su pantalla", () => {
    const setupChecklist = buildOwnerSetupChecklist(
      { activeLocations: 1, hasScheduledClass: true, hasAthletes: false, hasEnrolledAthletes: false, hasAttendance: false },
      { organizationId, selectedLocationId: locationId, canManageOrganizationAthletes: true }
    );
    expect(ownerSummaryNextStep({ organizationId, scopeQuery, setupChecklist, todaySessions: { sessions: [session()], truncated: false } })).toEqual({
      message: "Tu siguiente paso: da de alta a tus gimnastas.",
      cta: { label: "Dar de alta", href: `/owner/athletes?organizationId=${organizationId}` },
    });
  });

  it("no inventa acción para el paso de sede, que no tiene pantalla", () => {
    const setupChecklist = buildOwnerSetupChecklist(
      { activeLocations: 0, hasScheduledClass: false, hasAthletes: false, hasEnrolledAthletes: false, hasAttendance: false },
      { organizationId, selectedLocationId: null, canManageOrganizationAthletes: true }
    );
    expect(ownerSummaryNextStep({ organizationId, scopeQuery, setupChecklist })).toEqual({
      message: "Tu siguiente paso: crea una sede.",
      cta: null,
    });
  });

  it("con la puesta en marcha hecha, pide pasar las listas pendientes", () => {
    const step = ownerSummaryNextStep({
      organizationId,
      scopeQuery,
      attentionItems: {
        unrecordedSessions: { count: 2, latest: { id: "00000000-0000-4000-8000-0000000000c1", locationId, className: "Base" } },
        fullClasses: 0,
        overdueInvoices: null,
      },
      todaySessions: { sessions: [session()], truncated: false },
    });
    expect(step.message).toBe("Tienes 2 listas sin pasar de los últimos 7 días.");
    expect(step.cta).toEqual({
      label: "Pasar lista",
      href: `/owner/attendance?organizationId=${organizationId}&locationId=${locationId}&sessionId=00000000-0000-4000-8000-0000000000c1`,
    });
  });

  it("cuenta las sesiones de hoy sin las canceladas", () => {
    const sessions = [session(), session({ id: "x2" }), session({ id: "x3", status: "cancelled" })];
    expect(ownerSummaryNextStep({ organizationId, scopeQuery, todaySessions: { sessions, truncated: false } })).toEqual({
      message: "Hoy tienes 2 sesiones programadas.",
      cta: { label: "Pasar lista", href: `/owner/attendance?${scopeQuery}` },
    });
    expect(ownerSummaryNextStep({ organizationId, scopeQuery, todaySessions: { sessions: [session()], truncated: false } }).message)
      .toBe("Hoy tienes 1 sesión programada.");
    expect(ownerSummaryNextStep({ organizationId, scopeQuery, todaySessions: { sessions, truncated: true } }).message)
      .toBe("Hoy tienes 2 o más sesiones programadas.");
  });

  it("sin sesiones hoy o sin datos, no inventa cifras", () => {
    expect(ownerSummaryNextStep({ organizationId, scopeQuery, todaySessions: { sessions: [], truncated: false } })).toEqual({
      message: "Hoy no hay sesiones programadas.",
      cta: { label: "Ver clases", href: `/owner/classes?${scopeQuery}` },
    });
    expect(ownerSummaryNextStep({ organizationId, scopeQuery, todaySessions: null, attentionItems: null }).message)
      .toBe("La actividad de tu club, a mano para organizar el día.");
  });

  it("saluda por el nombre de pila o al equipo", () => {
    expect(ownerGreetingName("  Elvis Valdés ")).toBe("Elvis");
    expect(ownerGreetingName("")).toBe("equipo");
    expect(ownerGreetingName(null)).toBe("equipo");
  });
});

describe("OwnerSummaryHero", () => {
  it("con datos: academia, ámbito, saludo, acción, reloj y uso real del plan", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => usagePayload() }));
    vi.stubGlobal("fetch", fetchMock);
    act(() => {
      publishOwnerPlanUsage(organizationId, { readOnly: false, planCode: "free" });
    });
    render(
      <OwnerSummaryHero
        organizationId={organizationId}
        organizationName="Academia QA"
        scopeLabel="Todas las sedes"
        greetingName="Elvis"
        nextStep={{ message: "Tu siguiente paso: crea una clase con horario.", cta: { label: "Crear clase", href: `/owner/classes?${scopeQuery}` } }}
        timeZone="Europe/Madrid"
        subscriptionHref={`/owner/subscription?organizationId=${organizationId}`}
      />
    );

    const hero = screen.getByRole("region", { name: "Resumen de Academia QA" });
    expect(hero).toHaveClass("mat-field");
    expect(within(hero).getByRole("heading", { level: 1, name: "Resumen de Academia QA" })).toBeInTheDocument();
    expect(within(hero).getByText("Todas las sedes")).toBeInTheDocument();
    expect(within(hero).getByText("Hola, Elvis. Tu siguiente paso: crea una clase con horario.")).toBeInTheDocument();
    expect(within(hero).getByRole("link", { name: "Crear clase" })).toHaveAttribute("href", `/owner/classes?${scopeQuery}`);
    expect(hero.querySelector("time")).not.toBeNull();

    await waitFor(() => expect(within(hero).getByText("0/30 gimnastas · 3/10 clases · 1/5 grupos")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/v1/owner/saas/usage?organizationId=${organizationId}`,
      expect.objectContaining({ cache: "no-store" })
    );
    expect(within(hero).getByText("Plan Free")).toBeInTheDocument();
    expect(within(hero).getByText(/Dentro de los límites/)).toBeInTheDocument();
    expect(within(hero).getByRole("progressbar", { name: "Uso del plan: gimnastas" })).toHaveAttribute("aria-valuenow", "0");
    expect(within(hero).getByRole("link", { name: "Mejorar plan" })).toHaveAttribute(
      "href",
      `/owner/subscription?organizationId=${organizationId}`
    );
  });

  it("sin datos: saluda al equipo, no pinta plan ni cifras y no pide el uso", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(
      <OwnerSummaryHero
        organizationId="00000000-0000-4000-8000-0000000000a9"
        organizationName="Academia sin datos"
        scopeLabel={null}
        greetingName="equipo"
        nextStep={{ message: "La actividad de tu club, a mano para organizar el día.", cta: null }}
        timeZone="Europe/Madrid"
        subscriptionHref={null}
      />
    );
    const hero = screen.getByRole("region", { name: "Resumen de Academia sin datos" });
    expect(within(hero).getByText("Hola, equipo. La actividad de tu club, a mano para organizar el día.")).toBeInTheDocument();
    expect(within(hero).queryByRole("link")).toBeNull();
    expect(within(hero).queryByText(/Plan /)).toBeNull();
    expect(within(hero).queryByRole("progressbar")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("en el Resumen, un manager ve el plan pero no el uso ni «Mejorar plan»", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const managerOrganizationId = "00000000-0000-4000-8000-0000000000d1";
    act(() => {
      publishOwnerPlanUsage(managerOrganizationId, { readOnly: true, planCode: "starter" });
    });
    const scope: OwnerScope = {
      organization: { id: managerOrganizationId, name: "Club Manager", defaultCurrency: "EUR" },
      member: { id: "m", role: "manager", locationScopeMode: "selected" },
      locations: [{ id: locationId, name: "Sede Norte", timezone: "Europe/Madrid" }],
      selectedLocationId: locationId,
      canViewOrganizationAggregate: false,
    };
    render(
      <OwnerEssentialDashboard
        scope={scope}
        operationalSummary={null}
        todaySessions={{ sessions: [session()], truncated: false }}
        viewerName="Marta López"
      />
    );
    const hero = screen.getByRole("region", { name: "Resumen de Club Manager" });
    expect(within(hero).getByText("Sede Norte")).toBeInTheDocument();
    expect(within(hero).getByText("Hola, Marta. Hoy tienes 1 sesión programada.")).toBeInTheDocument();
    expect(within(hero).getByRole("link", { name: "Pasar lista" })).toHaveAttribute(
      "href",
      `/owner/attendance?organizationId=${managerOrganizationId}&locationId=${locationId}`
    );
    expect(within(hero).getByText("Plan Starter")).toBeInTheDocument();
    expect(within(hero).getByText(/Solo lectura/)).toBeInTheDocument();
    expect(within(hero).queryByRole("link", { name: /plan/i })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
