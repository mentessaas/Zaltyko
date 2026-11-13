// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Pasar lista: «Solo lectura» solo cuando el plan confirma que la academia lo
 * está. Mientras se comprueba el plan, estado neutro; si la comprobación
 * falla, error recuperable con reintento. Vale para «Quién entrena» y para el
 * guion de la sesión.
 */
import { OwnerSessionCoaches } from "@/components/owner-dashboard/OwnerSessionCoaches";
import { OwnerSessionPlanPanel } from "@/components/owner-dashboard/OwnerSessionPlanPanel";
import {
  ownerPlanCheckOf,
  type OwnerPlanCheck,
} from "@/components/owner-dashboard/OwnerPlanCheckNote";

const ORG = "92000000-0000-4000-8000-000000000001";
const SITE = "92000000-0000-4000-8000-000000000002";
const SESSION = "92000000-0000-4000-8000-000000000003";
const CLASS = "92000000-0000-4000-8000-000000000004";
const PLAN = "92000000-0000-4000-8000-000000000005";
const BLOCK = "92000000-0000-4000-8000-000000000006";
const ANA = "92000000-0000-4000-8000-00000000000a";

const ana = { staffProfileId: ANA, name: "Ana Ruiz" };

const fetchMock = vi.fn();

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function coachesView() {
  return {
    sessionId: SESSION,
    classTemplateId: CLASS,
    locationId: SITE,
    coaches: [ana],
    titulars: [ana],
    substitution: null,
    eligible: [ana],
    canWrite: true,
    assignedToViewer: false,
  };
}

function planView() {
  return {
    session: {
      id: SESSION,
      classTemplateId: CLASS,
      startsAt: "2026-11-11T16:00:00.000Z",
      started: false,
      cancelled: false,
      canMarkBlocks: false,
    },
    plan: {
      id: PLAN,
      revision: 1,
      focus: "Rondada",
      note: null,
      fromTemplateRevision: null,
      blocks: [
        { id: BLOCK, position: 1, kind: "warmup", discipline: null, apparatus: null, content: "Movilidad", durationMinutes: 10, done: false, doneAt: null },
      ],
      objectives: [],
      updatedAt: "2026-11-11T15:00:00.000Z",
    },
    template: { exists: false, revision: null },
    canManageTemplate: false,
    objectiveOptions: [],
  };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("estado de la comprobación del plan", () => {
  it("traduce la política del plan a los cuatro estados", () => {
    expect(ownerPlanCheckOf({ status: "loading" })).toBe("checking");
    expect(ownerPlanCheckOf({ status: "error" })).toBe("unverified");
    expect(ownerPlanCheckOf({ status: "ready", readOnly: true, planCode: "free" })).toBe("read_only");
    expect(ownerPlanCheckOf({ status: "ready", readOnly: false, planCode: "free" })).toBe("ok");
  });
});

describe("Quién entrena según la comprobación del plan", () => {
  function renderCoaches(planCheck: OwnerPlanCheck) {
    fetchMock.mockResolvedValueOnce(json(200, { data: coachesView() }));
    render(
      <OwnerSessionCoaches
        organizationId={ORG}
        locationId={SITE}
        sessionId={SESSION}
        coachMode={false}
        writesBlocked
        planCheck={planCheck}
      />
    );
  }

  it("mientras se comprueba el plan muestra un estado neutro, no «Solo lectura»", async () => {
    renderCoaches("checking");
    expect(await screen.findByRole("button", { name: "Cambiar en esta sesión" })).toBeDisabled();
    expect(screen.getByText("Comprobando el plan…")).toBeInTheDocument();
    expect(screen.queryByText(/Solo lectura/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("si la comprobación falla muestra un error con reintento, no «Solo lectura»", async () => {
    const retried = vi.fn();
    window.addEventListener("zaltyko:plan-usage-changed", retried);
    renderCoaches("unverified");
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("No pudimos comprobar el plan.");
    expect(screen.queryByText(/Solo lectura/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar la comprobación del plan" }));
    expect(retried).toHaveBeenCalledOnce();
    window.removeEventListener("zaltyko:plan-usage-changed", retried);
  });

  it("solo con el plan en solo lectura confirmado dice «Solo lectura»", async () => {
    renderCoaches("read_only");
    expect(await screen.findByText("Solo lectura: se puede consultar quién entrena, no cambiarlo.")).toBeInTheDocument();
    expect(screen.queryByText("Comprobando el plan…")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("Guion de la sesión según la comprobación del plan", () => {
  function renderPlan(planCheck: OwnerPlanCheck) {
    fetchMock.mockResolvedValue(json(200, { ok: true, data: planView() }));
    render(
      <OwnerSessionPlanPanel
        organizationId={ORG}
        locationId={SITE}
        sessionId={SESSION}
        readOnly
        planCheck={planCheck}
      />
    );
  }

  it("mientras se comprueba el plan muestra un estado neutro, no «solo lectura»", async () => {
    renderPlan("checking");
    expect(await screen.findByText("Movilidad")).toBeInTheDocument();
    expect(screen.getByText("Comprobando el plan…")).toBeInTheDocument();
    expect(screen.queryByText(/solo lectura/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Editar guion" })).not.toBeInTheDocument();
  });

  it("si la comprobación falla muestra un error con reintento, no «solo lectura»", async () => {
    const retried = vi.fn();
    window.addEventListener("zaltyko:plan-usage-changed", retried);
    renderPlan("unverified");
    expect(await screen.findByText("Movilidad")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("No pudimos comprobar el plan.");
    expect(screen.queryByText(/solo lectura/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar la comprobación del plan" }));
    expect(retried).toHaveBeenCalledOnce();
    window.removeEventListener("zaltyko:plan-usage-changed", retried);
  });

  it("solo con el plan en solo lectura confirmado dice «solo lectura»", async () => {
    renderPlan("read_only");
    expect(await screen.findByText("Movilidad")).toBeInTheDocument();
    expect(
      screen.getByText("La academia está en solo lectura: puedes ver el guion, pero no cambiarlo.")
    ).toBeInTheDocument();
    expect(screen.queryByText("Comprobando el plan…")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
