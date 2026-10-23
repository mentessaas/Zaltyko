// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLayoutEffect } from "react";
import { OwnerSaasBillingManager } from "@/components/owner-dashboard/OwnerSaasBillingManager";
import { decodeOwnerSaasBillingSnapshot } from "@/components/owner-dashboard/owner-saas-billing-response";
import { formatSaasAccessDate } from "@/components/owner-dashboard/owner-saas-presentation";
import { isDefinitiveSaasCommandRejection } from "@/components/owner-dashboard/owner-saas-command-rejection";
import { clearStoredSaasCommand, saasCommandStorageKey } from "@/components/owner-dashboard/owner-saas-pending-command";
import type { OwnerSaasBillingSnapshot } from "@/components/owner-dashboard/owner-saas-billing-types";

vi.mock("@/components/owner-dashboard/OwnerPlanUsage", () => ({ OwnerPlanUsage: () => null }));
const org = "10000000-0000-4000-8000-000000000001";
const otherOrg = "10000000-0000-4000-8000-000000000002";
const fetchMock = vi.fn();
function fixture(): OwnerSaasBillingSnapshot {
  return {
    organization: { id: org, name: "Academia sintética A" },
    entitlement: {
      planCode: "starter", source: "stripe_subscription", revision: 2,
      effectiveFrom: "2026-10-01T00:00:00.000Z", effectiveUntil: "2026-11-01T00:00:00.000Z",
    },
    limits: { maxAthletes: 75, maxGroups: 5, maxClasses: 20, maxAcademies: 1 },
    trial: { eligible: false, startsAt: null, endsAt: null, nextEligibleAt: null },
    subscription: {
      status: "active", billingInterval: "month",
      currentPeriodEndsAt: "2026-11-01T00:00:00.000Z", cancelAtPeriodEnd: true,
    },
    syncStatus: "synced",
    actions: { canStartTrial: false, canCheckoutStarter: false, canCheckoutGrowth: false, canOpenPortal: true },
  };
}
const payload = (data: unknown = fixture()) => ({ ok: true, data });
const response = (data: unknown = fixture(), ok = true) => ({ ok, json: async () => payload(data) });
beforeEach(() => { fetchMock.mockReset(); window.sessionStorage.clear(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("borrado seguro de comando SaaS persistido", () => {
  const command = { organizationId: org, action: "portal" as const, key: "synthetic-command-key", serializedBody: JSON.stringify({ organizationId: org }) };

  it("considera correcto removeItem aunque getItem falle después", () => {
    const storageKey = saasCommandStorageKey(org);
    window.sessionStorage.setItem(storageKey, JSON.stringify(command));
    const nativeRemove = Storage.prototype.removeItem;
    const remove = vi.spyOn(Storage.prototype, "removeItem").mockImplementation((key: string) => {
      nativeRemove.call(window.sessionStorage, key);
    });
    const get = vi.spyOn(Storage.prototype, "getItem");
    get.mockImplementationOnce(() => JSON.stringify(command)).mockImplementationOnce(() => { throw new Error("read unavailable after remove"); });

    expect(clearStoredSaasCommand(org, command)).toBe(true);
    expect(remove).toHaveBeenCalledOnce();
    expect(get).toHaveBeenCalledOnce();
    get.mockRestore();
    expect(window.sessionStorage.getItem(storageKey)).toBeNull();
  });

  it("no borra cuando la lectura previa falla", () => {
    const storageKey = saasCommandStorageKey(org);
    window.sessionStorage.setItem(storageKey, JSON.stringify(command));
    const remove = vi.spyOn(Storage.prototype, "removeItem");
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("read unavailable"); });

    expect(clearStoredSaasCommand(org, command)).toBe(false);
    expect(remove).not.toHaveBeenCalled();
    vi.restoreAllMocks();
    expect(window.sessionStorage.getItem(storageKey)).toBe(JSON.stringify(command));
  });
});

describe("contrato de lectura de facturación, no política de acceso", () => {
  it("proyecta solo campos usados y no comparte las referencias del payload", () => {
    const data = fixture();
    Object.assign(data, { unused: { internal: true } });
    Object.assign(data.organization, { unused: "not projected" });
    const result = decodeOwnerSaasBillingSnapshot(payload(data), org);
    expect(result).toEqual(fixture());
    expect(result?.organization).not.toBe(data.organization);
    expect(result?.entitlement).not.toBe(data.entitlement);
  });

  it.each([null, undefined, [], {}, { ok: false, data: fixture() }, { data: fixture() }, { ok: true, data: [] }])
    ("rechaza envoltorios incompletos o no canónicos %#", value => {
      expect(decodeOwnerSaasBillingSnapshot(value, org)).toBeNull();
    });

  it.each([
    -1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1,
  ])("rechaza cardinalidad no válida %s en cada límite", value => {
    for (const key of ["maxAthletes", "maxGroups", "maxClasses", "maxAcademies"] as const) {
      const data = fixture(); data.limits[key] = value;
      expect(decodeOwnerSaasBillingSnapshot(payload(data), org)).toBeNull();
    }
  });

  it.each([-1, 0, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])
    ("rechaza revisión no positiva/segura %s", revision => {
      const data = fixture(); data.entitlement.revision = revision;
      expect(decodeOwnerSaasBillingSnapshot(payload(data), org)).toBeNull();
    });

  it.each(["", "   ", "not-a-date", "2026-10-22", "2026-10-22T06:00:00", "2026-02-30T00:00:00Z", "1900-02-29T00:00:00Z", "2026-10-22T24:00:00Z", "2026-10-22T06:00:00Z\n"])
    ("rechaza fechas sin instante válido con zona %#", date => {
      const changes = [
        (v: OwnerSaasBillingSnapshot) => { v.entitlement.effectiveFrom = date; },
        (v: OwnerSaasBillingSnapshot) => { v.entitlement.effectiveUntil = date; },
        (v: OwnerSaasBillingSnapshot) => { v.trial.startsAt = date; },
        (v: OwnerSaasBillingSnapshot) => { v.trial.endsAt = date; },
        (v: OwnerSaasBillingSnapshot) => { v.trial.nextEligibleAt = date; },
        (v: OwnerSaasBillingSnapshot) => { v.subscription!.currentPeriodEndsAt = date; },
      ];
      for (const change of changes) {
        const data = fixture(); change(data);
        expect(decodeOwnerSaasBillingSnapshot(payload(data), org)).toBeNull();
      }
    });

  it("acepta cero y sin límite, estados desconocidos y fechas con offset sin decidir derechos", () => {
    const data = fixture();
    data.limits = { maxAthletes: 0, maxGroups: null, maxClasses: 17, maxAcademies: null };
    data.entitlement.source = "future_source";
    data.entitlement.effectiveUntil = "2001-01-01T01:00:00.123456+01:00";
    data.syncStatus = "future_sync";
    data.subscription!.status = "future_status";
    expect(decodeOwnerSaasBillingSnapshot(payload(data), org)).toEqual(data);
  });

  it("permite Free sin suscripción y fechas opcionales nulas", () => {
    const data = fixture(); data.entitlement.planCode = "free";
    data.entitlement.effectiveUntil = null; data.subscription = null;
    expect(decodeOwnerSaasBillingSnapshot(payload(data), org)).toEqual(data);
  });

  it("rechaza academia ajena, plan desconocido y acciones no booleanas", () => {
    expect(decodeOwnerSaasBillingSnapshot(payload(), otherOrg)).toBeNull();
    const data = fixture();
    expect(decodeOwnerSaasBillingSnapshot(payload({ ...data, entitlement: { ...data.entitlement, planCode: "invented" } }), org)).toBeNull();
    expect(decodeOwnerSaasBillingSnapshot(payload({ ...data, actions: { ...data.actions, canOpenPortal: "true" } }), org)).toBeNull();
    expect(decodeOwnerSaasBillingSnapshot(payload({ ...data, subscription: {} }), org)).toBeNull();
  });
});

describe("rechazo definitivo conocido frente a resultado incierto", () => {
  it.each([
    [401, "UNAUTHENTICATED"], [403, "FORBIDDEN"], [404, "ORGANIZATION_NOT_FOUND"],
    [400, "VALIDATION_ERROR"], [422, "PLAN_NOT_SELF_SERVE"],
    [409, "TRIAL_NOT_ELIGIBLE"], [409, "SUBSCRIPTION_ALREADY_EXISTS"], [410, "CHECKOUT_EXPIRED"],
  ])("acepta solo el rechazo canónico %s/%s", (status, code) => {
    expect(isDefinitiveSaasCommandRejection({ status: Number(status) }, { ok: false, error: code, code, message: "Rejected" })).toBe(true);
    expect(isDefinitiveSaasCommandRejection({ status: Number(status) }, { ok: false, error: code, code, message: "Rejected" }, { previouslyUncertain: true })).toBe(false);
  });
  it.each([
    [503, { ok: false, error: "FORBIDDEN", code: "FORBIDDEN", message: "Rejected" }],
    [408, { ok: false, error: "TIMEOUT", code: "TIMEOUT", message: "Unknown" }],
    [403, null], [403, { message: "Proxy response" }],
    [403, { ok: false, error: "different", code: "FORBIDDEN", message: "Rejected" }],
    [409, { ok: false, error: "CHECKOUT_IN_PROGRESS", code: "CHECKOUT_IN_PROGRESS", message: "Pending" }],
    [409, { ok: false, error: "IDEMPOTENCY_CONFLICT", code: "IDEMPOTENCY_CONFLICT", message: "Unknown" }],
    [400, { ok: false, error: "NEW_CODE", code: "NEW_CODE", message: "Unknown" }],
  ])("no libera intención ante estado/payload no concluyente %#", (status, data) => {
    expect(isDefinitiveSaasCommandRejection({ status: Number(status) }, data)).toBe(false);
  });
  it("reconoce exclusivamente el rate limit propio en 429", () => {
    expect(isDefinitiveSaasCommandRejection({ status: 429 }, { error: "RATE_LIMIT_EXCEEDED", message: "Espera", resetIn: 30 })).toBe(true);
    expect(isDefinitiveSaasCommandRejection({ status: 429 }, { error: "RATE_LIMIT_EXCEEDED", message: "Espera" }, { previouslyUncertain: true })).toBe(false);
    expect(isDefinitiveSaasCommandRejection({ status: 503 }, { error: "RATE_LIMIT_EXCEEDED" })).toBe(false);
  });
  it.each([
    [429, { error: "RATE_LIMIT_EXCEEDED" }],
    [429, { error: "RATE_LIMIT_EXCEEDED", message: " " }],
    [429, { error: "RATE_LIMIT_EXCEEDED", message: "Espera", ok: true }],
    [429, { error: "RATE_LIMIT_EXCEEDED", message: "Espera", data: {} }],
    [429, { error: "RATE_LIMIT_EXCEEDED", message: "Espera", code: "OTHER" }],
    [429, { error: "RATE_LIMIT_EXCEEDED", message: "Espera", status: 403 }],
    [429, { error: "RATE_LIMIT_EXCEEDED", message: "Espera", type: "unknown" }],
    [403, { ok: false, error: "FORBIDDEN", code: "FORBIDDEN", message: "No", data: {} }],
    [403, { ok: false, error: "FORBIDDEN", code: "FORBIDDEN", message: "No", status: 200 }],
    [403, { ok: false, error: "FORBIDDEN", code: "FORBIDDEN", message: "No", type: "unknown" }],
  ])("no permite rechazos SaaS incompletos o contradictorios %#", (status, value) => {
    expect(isDefinitiveSaasCommandRejection({ status: Number(status) }, value)).toBe(false);
  });
});

describe("panel de facturación: lecturas simuladas sin comandos", () => {
  it("una respuesta malformada no muestra datos ni acciones, aunque traiga flags true", async () => {
    const data = fixture(); data.limits.maxAthletes = -1;
    data.actions = { canStartTrial: true, canCheckoutStarter: true, canCheckoutGrowth: true, canOpenPortal: true };
    fetchMock.mockResolvedValueOnce(response(data));
    render(<OwnerSaasBillingManager organizationId={org} organizationName="Academia actual" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("No hemos podido actualizar el plan");
    expect(screen.queryByRole("region", { name: "Estado actual del plan" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Gestionar suscripción" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Activar prueba" })).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].method).toBeUndefined();
  });

  it("permite reintentar manualmente solo la lectura y conserva el estado del servidor", async () => {
    const data = fixture(); data.subscription!.status = "past_due";
    fetchMock.mockResolvedValueOnce(response({})).mockResolvedValueOnce(response(data));
    render(<OwnerSaasBillingManager organizationId={org} organizationName="Academia actual" />);
    fireEvent.click(await screen.findByRole("button", { name: "Volver a consultar" }));
    expect(await screen.findByText("75 gimnastas")).toBeVisible();
    expect(screen.getByText("Revisión de acceso: 2")).toBeVisible();
    expect(screen.getByText("Suscripción Pago pendiente de resolver")).toBeVisible();
    expect(screen.getByRole("button", { name: "Gestionar suscripción" })).toBeEnabled();
    expect(screen.queryByRole("link", { name: "Abrir portal seguro" })).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.every(([, options]) => !options.method && options.body === undefined)).toBe(true);
  });

  it("no muestra una respuesta de otra academia ni aunque sus acciones sean válidas", async () => {
    fetchMock.mockResolvedValueOnce(response());
    render(<OwnerSaasBillingManager organizationId={otherOrg} organizationName="Academia B" />);
    expect(await screen.findByRole("alert")).toBeVisible();
    expect(screen.queryByText("Academia sintética A")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Gestionar suscripción" })).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("descarta JSON tardío después de cambiar de academia", async () => {
    let finish!: (value: unknown) => void;
    const oldJson = new Promise(resolve => { finish = resolve; });
    const next = fixture(); next.organization = { id: otherOrg, name: "Academia B confirmada" };
    fetchMock.mockResolvedValueOnce({ ok: true, json: () => oldJson }).mockResolvedValueOnce(response(next));
    const view = render(<OwnerSaasBillingManager organizationId={org} organizationName="Academia A" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const oldSignal = fetchMock.mock.calls[0][1].signal;
    view.rerender(<OwnerSaasBillingManager organizationId={otherOrg} organizationName="Academia B" />);
    expect(await screen.findByText("Academia B confirmada")).toBeVisible();
    await act(async () => { finish(payload()); });
    expect(oldSignal.aborted).toBe(true);
    expect(screen.getByText("Academia B confirmada")).toBeVisible();
    expect(screen.queryByText("Academia sintética A")).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.every(([, options]) => !options.method)).toBe(true);
  });

  it("un refresco inválido conserva la lectura anterior como desactualizada y desactiva el Portal", async () => {
    fetchMock.mockResolvedValueOnce(response()).mockResolvedValueOnce(response({}));
    render(<OwnerSaasBillingManager organizationId={org} organizationName="Academia A" />);
    expect(await screen.findByRole("button", { name: "Gestionar suscripción" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Actualizar estado" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("puede estar desactualizado");
    expect(screen.getByText("75 gimnastas")).toBeVisible();
    expect(screen.getByRole("button", { name: "Gestionar suscripción" })).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.every(([, options]) => !options.method)).toBe(true);
  });

  it("un estado de sincronización desconocido no habilita el Portal", async () => {
    const data = fixture(); data.syncStatus = "future_sync";
    fetchMock.mockResolvedValueOnce(response(data));
    render(<OwnerSaasBillingManager organizationId={org} organizationName="Academia A" />);
    expect(await screen.findByText("75 gimnastas")).toBeVisible();
    expect(screen.getByRole("button", { name: "Gestionar suscripción" })).toBeDisabled();
    expect(screen.getByText("Estado de facturación en revisión")).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("mensajes de comandos simulados ligados a su academia", () => {
  function forRequest(url: string) {
    const data = fixture();
    if (url.includes(otherOrg)) data.organization = { id: otherOrg, name: "Academia B confirmada" };
    return data;
  }
  function postCalls() { return fetchMock.mock.calls.filter(([, options]) => options.method === "POST"); }

  it("un Portal tardío de A no anuncia éxito ni preparación bajo B", async () => {
    let finish!: (value: ReturnType<typeof response>) => void;
    fetchMock.mockImplementation(async (url, options) => options.method === "POST"
      ? new Promise(resolve => { finish = resolve; }) : response(forRequest(url)));
    const view = render(<OwnerSaasBillingManager organizationId={org} organizationName="Academia A" />);
    fireEvent.click(await screen.findByRole("button", { name: "Gestionar suscripción" }));
    expect(screen.getByRole("button", { name: "Preparando portal…" })).toBeDisabled();
    view.rerender(<OwnerSaasBillingManager organizationId={otherOrg} organizationName="Academia B" />);
    expect(await screen.findByText("Academia B confirmada")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Preparando portal…" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Gestionar suscripción" })).toBeDisabled();
    await act(async () => { finish(response({ portalUrl: "https://billing.stripe.com/p/session-synthetic" })); });
    expect(screen.queryByText(/El portal de facturación está listo/)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Abrir portal seguro" })).not.toBeInTheDocument();
    expect(postCalls()).toHaveLength(1);
    expect(JSON.parse(postCalls()[0][1].body)).toEqual({ organizationId: org });
    view.rerender(<OwnerSaasBillingManager organizationId={org} organizationName="Academia A" />);
    expect(await screen.findByText(/El portal de facturación está listo/)).toBeVisible();
    expect(screen.getByRole("link", { name: "Abrir portal seguro" })).toHaveAttribute("href", "https://billing.stripe.com/p/session-synthetic");
    expect(postCalls()).toHaveLength(1);
  });

  it("un inicio de prueba tardío de A conserva la lectura válida de B sin GET adicional", async () => {
    let finishTrial!: (value: ReturnType<typeof response>) => void;
    fetchMock.mockImplementation(async (url, options) => {
      if (options.method === "POST") {
        return new Promise(resolve => { finishTrial = resolve; });
      }
      const data = forRequest(url);
      if (url.includes(otherOrg)) {
        data.actions.canStartTrial = false;
      } else {
        data.entitlement.planCode = "free";
        data.entitlement.source = "bootstrap";
        data.subscription = null;
        data.trial.eligible = true;
        data.actions = {
          canStartTrial: true,
          canCheckoutStarter: false,
          canCheckoutGrowth: false,
          canOpenPortal: false,
        };
      }
      return response(data);
    });
    const view = render(<OwnerSaasBillingManager organizationId={org} organizationName="Academia A" />);
    fireEvent.click(await screen.findByRole("button", { name: "Activar prueba" }));
    await waitFor(() => expect(postCalls()).toHaveLength(1));

    view.rerender(<OwnerSaasBillingManager organizationId={otherOrg} organizationName="Academia B" />);
    expect(await screen.findByText("Academia B confirmada")).toBeVisible();
    expect(screen.getByText("75 gimnastas")).toBeVisible();
    const getCallsBeforeTrialReceipt = fetchMock.mock.calls.filter(([, options]) => !options.method);
    expect(getCallsBeforeTrialReceipt).toHaveLength(2);

    await act(async () => {
      finishTrial(response({
        trialId: "trial-late-a",
        startsAt: "2026-10-23T00:00:00.000Z",
        endsAt: "2026-10-30T00:00:00.000Z",
        planCode: "starter",
        entitlementRevision: 3,
      }));
    });

    expect(screen.getByText("Academia B confirmada")).toBeVisible();
    expect(screen.getByText("75 gimnastas")).toBeVisible();
    expect(screen.queryByText(/El servidor confirma la prueba Starter/)).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([, options]) => !options.method)).toHaveLength(2);
    expect(postCalls()).toHaveLength(1);
  });

  it("refresca la academia A tras activar la prueba y conserva la confirmación y su periodo", async () => {
    let readCount = 0;
    fetchMock.mockImplementation(async (_url, options) => {
      if (options.method === "POST") {
        return response({
          trialId: "trial-active-a",
          startsAt: "2026-10-23T00:00:00.000Z",
          endsAt: "2026-10-30T00:00:00.000Z",
          planCode: "starter",
          entitlementRevision: 3,
        });
      }
      readCount += 1;
      const data = fixture();
      data.entitlement.planCode = readCount === 1 ? "free" : "starter";
      data.entitlement.source = readCount === 1 ? "bootstrap" : "trial";
      data.entitlement.revision = readCount === 1 ? 2 : 3;
      data.entitlement.effectiveUntil = "2026-10-30T00:00:00.000Z";
      data.subscription = null;
      data.trial = {
        eligible: readCount === 1,
        startsAt: readCount === 1 ? null : "2026-10-23T00:00:00.000Z",
        endsAt: readCount === 1 ? null : "2026-10-30T00:00:00.000Z",
        nextEligibleAt: null,
      };
      data.actions = {
        canStartTrial: readCount === 1,
        canCheckoutStarter: false,
        canCheckoutGrowth: false,
        canOpenPortal: false,
      };
      return response(data);
    });
    render(<OwnerSaasBillingManager organizationId={org} organizationName="Academia A" />);
    fireEvent.click(await screen.findByRole("button", { name: "Activar prueba" }));

    const confirmedNotice = await screen.findByText(/El servidor confirma la prueba Starter/);
    expect(confirmedNotice).toHaveTextContent("hasta el");
    expect(confirmedNotice).toHaveTextContent(/30/);
    expect(confirmedNotice).toHaveTextContent("No se ha solicitado ningún cobro.");
    await waitFor(() => expect(readCount).toBe(2));
    const displayedEnd = formatSaasAccessDate("2026-10-30T00:00:00.000Z");
    expect(screen.getByText(`Finaliza el ${displayedEnd}. No se hará ningún cobro automático al terminar.`)).toBeVisible();
    expect(fetchMock.mock.calls.filter(([, options]) => !options.method)).toHaveLength(2);
    expect(postCalls()).toHaveLength(1);
  });

  it("un error tardío de A no se atribuye a B ni se reenvía automáticamente", async () => {
    let fail!: (error: Error) => void;
    fetchMock.mockImplementation(async (url, options) => options.method === "POST"
      ? new Promise((_resolve, reject) => { fail = reject; }) : response(forRequest(url)));
    const view = render(<OwnerSaasBillingManager organizationId={org} organizationName="Academia A" />);
    fireEvent.click(await screen.findByRole("button", { name: "Gestionar suscripción" }));
    view.rerender(<OwnerSaasBillingManager organizationId={otherOrg} organizationName="Academia B" />);
    expect(await screen.findByText("Academia B confirmada")).toBeVisible();
    await act(async () => { fail(new Error("Fallo sintético del Portal de A")); });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Gestionar suscripción" })).toBeDisabled();
    expect(screen.getByText(/Hay una operación de facturación pendiente en otra academia/)).toBeVisible();
    expect(postCalls()).toHaveLength(1);
    view.rerender(<OwnerSaasBillingManager organizationId={org} organizationName="Academia A" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("No podemos confirmar el resultado");
    expect(postCalls()).toHaveLength(1);
  });

  it("un éxito ya mostrado de A tampoco aparece en el primer commit de B", async () => {
    const frames: string[] = [];
    function Probe({ organizationId }: { organizationId: string }) {
      useLayoutEffect(() => { frames.push(document.body.textContent ?? ""); }, [organizationId]);
      return null;
    }
    function View({ organizationId }: { organizationId: string }) {
      return <><OwnerSaasBillingManager organizationId={organizationId} organizationName="Academia actual" /><Probe organizationId={organizationId} /></>;
    }
    fetchMock.mockImplementation(async (url, options) => options.method === "POST"
      ? response({ portalUrl: "https://billing.stripe.com/p/session-synthetic" }) : response(forRequest(url)));
    const view = render(<View organizationId={org} />);
    fireEvent.click(await screen.findByRole("button", { name: "Gestionar suscripción" }));
    expect(await screen.findByText(/El portal de facturación está listo/)).toBeVisible();
    view.rerender(<View organizationId={otherOrg} />);
    expect(frames.at(-1)).not.toContain("El portal de facturación está listo");
    expect(frames.at(-1)).not.toContain("Portal de facturación listo");
    expect(await screen.findByText("Academia B confirmada")).toBeVisible();
    expect(postCalls()).toHaveLength(1);
  });
});

describe("exclusión síncrona de comandos simulados de facturación", () => {
  type Action = "portal" | "trial" | "checkout";
  const actionNames = { portal: "Gestionar suscripción", trial: "Activar prueba", checkout: "Contratar Growth" };
  function actionFixture(action: Action) {
    const data = fixture();
    if (action !== "portal") {
      data.entitlement.planCode = "free"; data.entitlement.source = "bootstrap";
      data.subscription = null;
      data.trial.eligible = action === "trial";
      data.actions = {
        canStartTrial: action === "trial", canCheckoutStarter: action === "checkout",
        canCheckoutGrowth: action === "checkout", canOpenPortal: false,
      };
    }
    return data;
  }
  function actionResult(action: Action) {
    if (action === "portal") return { portalUrl: "https://billing.stripe.com/p/session-synthetic" };
    if (action === "trial") return {
      trialId: "trial-synthetic", startsAt: "2026-10-01T00:00:00.000Z",
      endsAt: "2026-10-08T00:00:00.000Z", planCode: "starter", entitlementRevision: 3,
    };
    return {
      operationId: "operation-synthetic", checkoutUrl: "https://checkout.stripe.com/c/pay/synthetic",
      expiresAt: "2026-11-01T00:00:00.000Z", status: "pending",
    };
  }
  function posts() { return fetchMock.mock.calls.filter(([, options]) => options.method === "POST"); }

  function leavingPageIsPrevented() {
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  }

  it.each((["portal", "checkout"] as const).flatMap(action => [
    [action, "https://example.test/synthetic-session"],
    [action, `https://${action === "portal" ? "checkout" : "billing"}.stripe.com/synthetic-session`],
    [action, `https://synthetic-user@${action === "portal" ? "billing" : "checkout"}.stripe.com/synthetic-session`],
    [action, `https://${action === "portal" ? "billing" : "checkout"}.stripe.com:8443/synthetic-session`],
    [action, ` https://${action === "portal" ? "billing" : "checkout"}.stripe.com/synthetic-session`],
  ] as const))("un destino no canónico de %s no crea un enlace ni libera una intención %#", async (action, unsafeUrl) => {
    let count = 0;
    fetchMock.mockImplementation(async (_url, options) => {
      if (options.method !== "POST") return response(actionFixture(action));
      const result = actionResult(action);
      return response(++count === 1 ? { ...result, [action === "portal" ? "portalUrl" : "checkoutUrl"]: unsafeUrl } : result);
    });
    render(<OwnerSaasBillingManager organizationId={org} organizationName="Academia sintética" />);
    fireEvent.click(await screen.findByRole("button", { name: actionNames[action] }));
    const retry = await screen.findByRole("button", { name: "Reintentar la operación pendiente" });
    await waitFor(() => expect(retry).toBeEnabled());
    expect(screen.queryByRole("link", { name: "Abrir portal seguro" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Continuar al pago seguro" })).not.toBeInTheDocument();
    expect([...document.querySelectorAll("a")].some(link => link.getAttribute("href") === unsafeUrl)).toBe(false);
    expect(leavingPageIsPrevented()).toBe(true);
    expect(posts()).toHaveLength(1);
    fireEvent.click(retry);
    expect(await screen.findByRole("link", { name: action === "portal" ? "Abrir portal seguro" : "Continuar al pago seguro" })).toBeVisible();
    expect(posts()).toHaveLength(2);
    expect(posts()[1]).toEqual(posts()[0]);
    expect(leavingPageIsPrevented()).toBe(false);
  });

  it.each(["portal", "trial", "checkout"] as const)("avisa al salir durante %s y retira el aviso tras el acuse", async action => {
    let finish!: (value: ReturnType<typeof response>) => void;
    fetchMock.mockImplementation(async (_url, options) => options.method === "POST"
      ? new Promise(resolve => { finish = resolve; }) : response(actionFixture(action)));
    render(<OwnerSaasBillingManager organizationId={org} organizationName="Academia sintética" />);
    const button = await screen.findByRole("button", { name: actionNames[action] });
    expect(leavingPageIsPrevented()).toBe(false);
    fireEvent.click(button);
    expect(leavingPageIsPrevented()).toBe(true);
    expect(posts()).toHaveLength(1);
    await act(async () => { finish(response(actionResult(action))); });
    expect(leavingPageIsPrevented()).toBe(false);
    expect(posts()).toHaveLength(1);
  });

  it("conserva el aviso incierto tras refrescar o cambiar academia y lo retira al desmontar", async () => {
    fetchMock.mockImplementation(async (url, options) => {
      if (options.method === "POST") throw new Error("lost");
      const data = fixture();
      if (url.includes(otherOrg)) data.organization = { id: otherOrg, name: "Academia B confirmada" };
      return response(data);
    });
    const view = render(<OwnerSaasBillingManager organizationId={org} organizationName="Academia A" />);
    fireEvent.click(await screen.findByRole("button", { name: "Gestionar suscripción" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No podemos confirmar el resultado");
    expect(leavingPageIsPrevented()).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Actualizar estado" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(leavingPageIsPrevented()).toBe(true);
    view.rerender(<OwnerSaasBillingManager organizationId={otherOrg} organizationName="Academia B" />);
    expect(await screen.findByText("Academia B confirmada")).toBeVisible();
    expect(leavingPageIsPrevented()).toBe(true);
    expect(posts()).toHaveLength(1);
    view.unmount();
    expect(leavingPageIsPrevented()).toBe(false);
  });

  it("retira el aviso después de un rechazo conocido sin reenviar", async () => {
    let finish!: (value: unknown) => void;
    fetchMock.mockImplementation(async (_url, options) => options.method === "POST"
      ? new Promise(resolve => { finish = resolve; }) : response(fixture()));
    render(<OwnerSaasBillingManager organizationId={org} organizationName="Academia sintética" />);
    fireEvent.click(await screen.findByRole("button", { name: "Gestionar suscripción" }));
    expect(leavingPageIsPrevented()).toBe(true);
    await act(async () => { finish({ ok: false, status: 403, json: async () => ({ ok: false, error: "FORBIDDEN", code: "FORBIDDEN", message: "Rejected" }) }); });
    expect(await screen.findByRole("alert")).toHaveTextContent("no tiene permiso");
    expect(leavingPageIsPrevented()).toBe(false);
    expect(posts()).toHaveLength(1);
    expect(window.sessionStorage.getItem(`owner-saas-pending-command:v1:${org}`)).toBeNull();
  });

  it.each(["portal", "trial", "checkout"] as const)("un fallo previo al envío de %s no activa el aviso", async action => {
    vi.spyOn(crypto, "randomUUID").mockImplementationOnce(() => { throw new Error("unavailable"); });
    fetchMock.mockResolvedValue(response(actionFixture(action)));
    render(<OwnerSaasBillingManager organizationId={org} organizationName="Academia sintética" />);
    fireEvent.click(await screen.findByRole("button", { name: actionNames[action] }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No se ha enviado ninguna solicitud");
    expect(leavingPageIsPrevented()).toBe(false);
    expect(posts()).toHaveLength(0);
  });

  it.each(["portal", "trial", "checkout"] as const)("dos activaciones en el mismo render envían solo un %s", async action => {
    let finish!: (value: ReturnType<typeof response>) => void;
    fetchMock.mockImplementation(async (_url, options) => options.method === "POST"
      ? new Promise(resolve => { finish = resolve; }) : response(actionFixture(action)));
    render(<OwnerSaasBillingManager organizationId={org} organizationName="Academia sintética" />);
    const button = await screen.findByRole("button", { name: actionNames[action] });
    act(() => { button.click(); button.click(); });
    expect(posts()).toHaveLength(1);
    expect(posts()[0][1].headers["Idempotency-Key"]).toBeTruthy();
    expect(JSON.parse(posts()[0][1].body)).toEqual(action === "checkout"
      ? { organizationId: org, planCode: "growth", billingInterval: "month" } : { organizationId: org });
    await act(async () => { finish(response(actionResult(action))); });
    expect(posts()).toHaveLength(1);
  });

  it("Starter y Growth pulsados sin ceder el render no inician dos contrataciones", async () => {
    let finish!: (value: ReturnType<typeof response>) => void;
    fetchMock.mockImplementation(async (_url, options) => options.method === "POST"
      ? new Promise(resolve => { finish = resolve; }) : response(actionFixture("checkout")));
    render(<OwnerSaasBillingManager organizationId={org} organizationName="Academia sintética" />);
    const starter = await screen.findByRole("button", { name: "Contratar Starter" });
    const growth = screen.getByRole("button", { name: "Contratar Growth" });
    act(() => { starter.click(); growth.click(); });
    expect(posts()).toHaveLength(1);
    expect(JSON.parse(posts()[0][1].body).planCode).toBe("starter");
    await act(async () => { finish(response(actionResult("checkout"))); });
    expect(posts()).toHaveLength(1);
  });

  it.each(["portal", "trial", "checkout"] as const)("fallo de preparación de %s no envía y libera el bloqueo", async action => {
    vi.spyOn(crypto, "randomUUID").mockImplementationOnce(() => { throw new Error("unavailable"); });
    fetchMock.mockImplementation(async (_url, options) => response(options.method === "POST"
      ? actionResult(action) : actionFixture(action)));
    render(<OwnerSaasBillingManager organizationId={org} organizationName="Academia sintética" />);
    fireEvent.click(await screen.findByRole("button", { name: actionNames[action] }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No se ha enviado ninguna solicitud");
    expect(posts()).toHaveLength(0);
    expect(screen.getByRole("button", { name: actionNames[action] })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: actionNames[action] }));
    await waitFor(() => expect(posts()).toHaveLength(1));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });

  it.each(["portal", "trial", "checkout"] as const)("un reintento humano de %s tras fallo conserva clave y cuerpo", async action => {
    let count = 0;
    fetchMock.mockImplementation(async (_url, options) => {
      if (options.method !== "POST") return response(actionFixture(action));
      if (++count === 1) throw new Error("response lost");
      return response(actionResult(action));
    });
    render(<OwnerSaasBillingManager organizationId={org} organizationName="Academia sintética" />);
    fireEvent.click(await screen.findByRole("button", { name: actionNames[action] }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No podemos confirmar el resultado");
    expect(posts()).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Reintentar la operación pendiente" }));
    await waitFor(() => expect(posts()).toHaveLength(2));
    expect(posts()[1][0]).toEqual(posts()[0][0]);
    expect(posts()[1][1]).toEqual(posts()[0][1]);
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });

  it.each([
    ["portal", 401], ["portal", 403], ["portal", 429],
    ["trial", 401], ["trial", 403], ["trial", 429],
    ["checkout", 401], ["checkout", 403], ["checkout", 429],
  ] as const)("un rechazo posterior no libera %s previamente incierto (%s)", async (action, status) => {
    let count = 0;
    const code = status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN";
    fetchMock.mockImplementation(async (_url, options) => {
      if (options.method !== "POST") return response(actionFixture(action));
      if (++count === 1) throw new Error("Synthetic lost acknowledgement");
      if (count === 2) return { ok: false, status, json: async () => status === 429
        ? { error: "RATE_LIMIT_EXCEEDED", message: "Espera" }
        : { ok: false, error: code, code, message: "Acceso rechazado" } };
      return response(actionResult(action));
    });
    render(<OwnerSaasBillingManager organizationId={org} organizationName="Academia sintética" />);
    const actionButton = await screen.findByRole("button", { name: actionNames[action] });
    fireEvent.click(actionButton);
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Reintentar la operación pendiente" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Reintentar la operación pendiente" })).toBeEnabled());
    expect(leavingPageIsPrevented()).toBe(true);
    expect(actionButton).toBeInTheDocument(); expect(actionButton).toBeDisabled();
    expect(posts()).toHaveLength(2); expect(posts()[1]).toEqual(posts()[0]);
    fireEvent.click(screen.getByRole("button", { name: "Reintentar la operación pendiente" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(posts()[2]).toEqual(posts()[0]); expect(leavingPageIsPrevented()).toBe(false);
  });

  it.each(["portal", "trial", "checkout"] as const)("restaura y reintenta el comando completo de %s sin recomponer cuerpo ni clave", async action => {
    const key = `owner-saas-pending-command:v1:${org}`;
    const body = action === "checkout" ? { organizationId: org, planCode: "growth", billingInterval: "year" } : { organizationId: org };
    const command = { organizationId: org, action, ...(action === "checkout" ? { planCode: "growth", billingInterval: "year" } : {}), key: "previous-synthetic-intent", serializedBody: JSON.stringify(body) };
    window.sessionStorage.setItem(key, JSON.stringify(command));
    const randomUUID = vi.spyOn(crypto, "randomUUID");
    let count = 0;
    fetchMock.mockImplementation(async (_url, options) => options.method !== "POST" ? response(actionFixture(action))
      : ++count === 1 ? { ok: false, status: 401, json: async () => ({ ok: false, error: "UNAUTHENTICATED", code: "UNAUTHENTICATED", message: "Accede de nuevo" }) }
      : response(actionResult(action)));
    render(<OwnerSaasBillingManager organizationId={org} organizationName="Academia sintética" />);
    const retry = await screen.findByRole("button", { name: "Reintentar la operación pendiente" });
    expect(screen.getByRole("button", { name: actionNames[action] })).toBeDisabled();
    fireEvent.click(retry);
    expect(await screen.findByRole("alert")).toHaveTextContent("No podemos confirmar");
    expect(window.sessionStorage.getItem(key)).not.toBeNull();
    expect(randomUUID).not.toHaveBeenCalled(); expect(leavingPageIsPrevented()).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Reintentar la operación pendiente" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(posts()).toHaveLength(2); expect(posts()[1]).toEqual(posts()[0]);
    expect(posts()[0][1].headers["Idempotency-Key"]).toBe("previous-synthetic-intent");
    expect(posts()[0][1].body).toBe(JSON.stringify(body));
    expect(window.sessionStorage.getItem(key)).toBeNull();
    expect(leavingPageIsPrevented()).toBe(false);
  });

  it("no envía si falla el almacenamiento previo y bloquea hasta comprobarlo de nuevo", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    fetchMock.mockImplementation(async (_url, options) => options.method === "POST" ? response(actionResult("checkout")) : response(actionFixture("checkout")));
    render(<OwnerSaasBillingManager organizationId={org} organizationName="Academia sintética" />);
    fireEvent.click(await screen.findByRole("button", { name: actionNames.checkout }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No se ha enviado ninguna solicitud");
    expect(posts()).toHaveLength(0);
    setItem.mockRestore();
  });

  it("un registro corrupto bloquea acciones sin inventar una solicitud", async () => {
    window.sessionStorage.setItem(`owner-saas-pending-command:v1:${org}`, JSON.stringify({ organizationId: org, action: "checkout", key: "synthetic-key", serializedBody: "{}" }));
    fetchMock.mockImplementation(async (_url, options) => options.method === "POST" ? response(actionResult("checkout")) : response(actionFixture("checkout")));
    render(<OwnerSaasBillingManager organizationId={org} organizationName="Academia sintética" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("no se puede validar");
    expect(screen.getByRole("button", { name: actionNames.checkout })).toBeDisabled();
    expect(posts()).toHaveLength(0);
  });

  it("un refresco con permisos nuevos no borra ni recompone el Checkout pendiente", async () => {
    let changed = false;
    let count = 0;
    fetchMock.mockImplementation(async (_url, options) => {
      if (options.method === "POST") {
        if (++count === 1) throw new Error("lost");
        return response(actionResult("checkout"));
      }
      const data = actionFixture("checkout");
      if (changed) {
        data.entitlement.revision = 5; data.syncStatus = "recovery_required";
        data.actions = { canStartTrial: false, canCheckoutStarter: false, canCheckoutGrowth: false, canOpenPortal: false };
      }
      return response(data);
    });
    render(<OwnerSaasBillingManager organizationId={org} organizationName="Academia sintética" />);
    fireEvent.click(await screen.findByRole("button", { name: "Contratar Growth" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No podemos confirmar el resultado");
    expect(screen.getByRole("button", { name: "Anual" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Anual" }));
    expect(screen.getByRole("button", { name: "Anual" })).toHaveAttribute("aria-pressed", "false");
    changed = true;
    fireEvent.click(screen.getByRole("button", { name: "Actualizar estado" }));
    expect(await screen.findByText("Revisión de acceso: 5")).toBeVisible();
    expect(posts()).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Reintentar la operación pendiente" }));
    await waitFor(() => expect(posts()).toHaveLength(2));
    expect(posts()[1]).toEqual(posts()[0]);
    expect(JSON.parse(posts()[1][1].body)).toEqual({ organizationId: org, planCode: "growth", billingInterval: "month" });
    expect(await screen.findByRole("link", { name: "Continuar al pago seguro" })).toBeVisible();
  });

  it.each([
    () => ({ ok: false, status: 503, json: async () => ({ ok: false, error: "BILLING_PROVIDER_UNAVAILABLE", code: "BILLING_PROVIDER_UNAVAILABLE", message: "Unavailable" }) }),
    () => ({ ok: false, status: 408, json: async () => ({ error: "timeout" }) }),
    () => response({}),
    () => response({ ...actionResult("checkout"), operationId: "" }),
    () => response({ ...actionResult("checkout"), expiresAt: "not-a-date" }),
    () => response({ ...actionResult("checkout"), expiresAt: "2026-11-01" }),
    () => response({ ...actionResult("checkout"), expiresAt: "2026-11-01T00:00:00" }),
    () => response({ ...actionResult("checkout"), expiresAt: "2026-02-30T00:00:00Z" }),
    () => ({ ok: true, status: 200, json: async () => { throw new Error("invalid JSON"); } }),
    () => ({ ok: false, status: 403, json: async () => ({ message: "proxy rejection" }) }),
    () => ({ ok: false, status: 409, json: async () => ({ ok: false, error: "CHECKOUT_IN_PROGRESS", code: "CHECKOUT_IN_PROGRESS", message: "Pending" }) }),
  ])("un acuse incierto conserva solicitud y bloquea cambiar operación %#", async failed => {
    let count = 0;
    fetchMock.mockImplementation(async (_url, options) => options.method === "POST"
      ? (++count === 1 ? failed() : response(actionResult("checkout"))) : response(actionFixture("checkout")));
    render(<OwnerSaasBillingManager organizationId={org} organizationName="Academia sintética" />);
    fireEvent.click(await screen.findByRole("button", { name: "Contratar Growth" }));
    const retry = await screen.findByRole("button", { name: "Reintentar la operación pendiente" });
    await waitFor(() => expect(retry).toBeEnabled());
    expect(screen.getByRole("button", { name: "Anual" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Contratar Starter" })).not.toBeInTheDocument();
    expect(posts()).toHaveLength(1);
    fireEvent.click(retry);
    expect(await screen.findByRole("link", { name: "Continuar al pago seguro" })).toBeVisible();
    expect(posts()).toHaveLength(2);
    expect(posts()[1]).toEqual(posts()[0]);
  });

  it("un rechazo conocido libera para corregir con una nueva clave y confirmación humana", async () => {
    let count = 0;
    fetchMock.mockImplementation(async (_url, options) => {
      if (options.method !== "POST") return response(actionFixture("checkout"));
      if (++count === 1) return { ok: false, status: 400, json: async () => ({ ok: false, error: "VALIDATION_ERROR", code: "VALIDATION_ERROR", message: "Rejected" }) };
      return response(actionResult("checkout"));
    });
    render(<OwnerSaasBillingManager organizationId={org} organizationName="Academia sintética" />);
    fireEvent.click(await screen.findByRole("button", { name: "Contratar Growth" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No se ha podido validar");
    expect(screen.queryByRole("region", { name: "Operación de facturación pendiente" })).not.toBeInTheDocument();
    expect(posts()).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Anual" }));
    fireEvent.click(screen.getByRole("button", { name: "Contratar Growth" }));
    expect(await screen.findByRole("link", { name: "Continuar al pago seguro" })).toBeVisible();
    expect(posts()).toHaveLength(2);
    expect(posts()[1][1].headers["Idempotency-Key"]).not.toEqual(posts()[0][1].headers["Idempotency-Key"]);
    expect(JSON.parse(posts()[1][1].body).billingInterval).toBe("year");
  });

  it("una intención incierta no se reenvía desde otra academia", async () => {
    let count = 0;
    fetchMock.mockImplementation(async (url, options) => {
      if (options.method === "POST") {
        if (++count === 1) throw new Error("lost");
        return response(actionResult("portal"));
      }
      const data = fixture();
      if (url.includes(otherOrg)) data.organization = { id: otherOrg, name: "Academia B confirmada" };
      return response(data);
    });
    const view = render(<OwnerSaasBillingManager organizationId={org} organizationName="Academia A" />);
    fireEvent.click(await screen.findByRole("button", { name: "Gestionar suscripción" }));
    expect(await screen.findByRole("alert")).toBeVisible();
    view.rerender(<OwnerSaasBillingManager organizationId={otherOrg} organizationName="Academia B" />);
    expect(await screen.findByText("Academia B confirmada")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Reintentar la operación pendiente" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Gestionar suscripción" })).toBeDisabled();
    expect(posts()).toHaveLength(1);
    view.rerender(<OwnerSaasBillingManager organizationId={org} organizationName="Academia A" />);
    fireEvent.click(await screen.findByRole("button", { name: "Reintentar la operación pendiente" }));
    expect(await screen.findByRole("link", { name: "Abrir portal seguro" })).toBeVisible();
    expect(posts()[1]).toEqual(posts()[0]);
  });

  it("un acuse trial con revisión inválida no anuncia activación y conserva el reintento", async () => {
    let count = 0;
    fetchMock.mockImplementation(async (_url, options) => options.method === "POST"
      ? response(++count === 1 ? { ...actionResult("trial"), entitlementRevision: 0 } : actionResult("trial"))
      : response(actionFixture("trial")));
    render(<OwnerSaasBillingManager organizationId={org} organizationName="Academia sintética" />);
    fireEvent.click(await screen.findByRole("button", { name: "Activar prueba" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No podemos confirmar el resultado");
    expect(screen.queryByText(/El servidor confirma la prueba Starter/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar la operación pendiente" }));
    expect(await screen.findByText(/El servidor confirma la prueba Starter/)).toBeVisible();
    expect(posts()[1]).toEqual(posts()[0]);
  });

  it.each([
    { startsAt: "2026-10-01" }, { endsAt: "2026-10-08T00:00:00" },
    { endsAt: "2026-02-30T00:00:00Z" }, { endsAt: "2026-10-01T00:00:00.000Z" },
    { startsAt: "2026-10-09T00:00:00.000Z" },
    { startsAt: "2026-10-01T00:30:00+01:00", endsAt: "2026-09-30T23:00:00Z" },
  ])("un acuse de prueba con fechas inválidas o periodo no positivo conserva la solicitud %#", async fields => {
    let count = 0;
    fetchMock.mockImplementation(async (_url, options) => options.method === "POST"
      ? response(++count === 1 ? { ...actionResult("trial"), ...fields } : actionResult("trial"))
      : response(actionFixture("trial")));
    render(<OwnerSaasBillingManager organizationId={org} organizationName="Academia sintética" />);
    fireEvent.click(await screen.findByRole("button", { name: "Activar prueba" }));
    const retry = await screen.findByRole("button", { name: "Reintentar la operación pendiente" });
    await waitFor(() => expect(retry).toBeEnabled());
    expect(screen.queryByText(/El servidor confirma la prueba Starter/)).not.toBeInTheDocument();
    expect(leavingPageIsPrevented()).toBe(true);
    expect(posts()).toHaveLength(1);
    fireEvent.click(retry);
    expect(await screen.findByText(/El servidor confirma la prueba Starter/)).toBeVisible();
    expect(posts()[1]).toEqual(posts()[0]);
    expect(leavingPageIsPrevented()).toBe(false);
  });

  it.each([
    { startsAt: "2001-01-01T00:00:00Z", endsAt: "2001-01-01T00:02:00Z" },
    { startsAt: "2026-10-01T00:30:00+01:00", endsAt: "2026-09-30T23:31:00Z" },
  ])("acepta un periodo positivo del servidor sin imponer siete días ni vigencia local %#", async fields => {
    fetchMock.mockImplementation(async (_url, options) => options.method === "POST"
      ? response({ ...actionResult("trial"), ...fields }) : response(actionFixture("trial")));
    render(<OwnerSaasBillingManager organizationId={org} organizationName="Academia sintética" />);
    fireEvent.click(await screen.findByRole("button", { name: "Activar prueba" }));
    expect(await screen.findByText(/El servidor confirma la prueba Starter/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Reintentar la operación pendiente" })).not.toBeInTheDocument();
    expect(posts()).toHaveLength(1);
  });
});
