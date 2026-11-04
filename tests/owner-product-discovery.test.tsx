// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockFetch = vi.hoisted(() => vi.fn());
const observerHarness: { callback: IntersectionObserverCallback | null } = {
  callback: null,
};
let observedCards: Element[] = [];

class MockIntersectionObserver implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = "0px";
  readonly thresholds = [0.25];

  constructor(callback: IntersectionObserverCallback) {
    observerHarness.callback = callback;
  }

  observe(target: Element) {
    observedCards.push(target);
  }

  unobserve() {}

  disconnect() {}

  takeRecords() {
    return [];
  }
}

import { OwnerProductDiscovery } from "@/components/owner-dashboard/OwnerProductDiscovery";

const organizationId = "a0000000-0000-4000-8000-000000000001";
const locationId = "a0000000-0000-4000-8000-000000000002";

function feature(
  interest: { intent: string | null; pilot: boolean } = {
    intent: null,
    pilot: false,
  }
) {
  return {
    id: "club-events",
    title: "Competiciones entre clubes",
    summary: "Organiza un evento o participa con tu academia.",
    status: "planned",
    statusLabel: "En preparación",
    intents: [
      { id: "organize", label: "Organizar una competición" },
      { id: "participate", label: "Participar con mi club" },
    ],
    interest,
  };
}

function success(
  features: ReturnType<typeof feature>[],
  measurementAvailable = true
) {
  return { ok: true, data: { features, measurementAvailable } };
}

function response(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

beforeEach(() => {
  mockFetch.mockReset();
  observerHarness.callback = null;
  observedCards = [];
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("OwnerProductDiscovery", () => {
  it("presenta el estado antes del clic y registra apertura, interés y retirada", async () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const user = userEvent.setup();
    const initialFeature = feature();
    mockFetch
      .mockResolvedValueOnce(response(success([initialFeature])))
      .mockResolvedValueOnce(response(success([initialFeature])))
      .mockResolvedValueOnce(response(success([initialFeature])))
      .mockResolvedValueOnce(
        response(success([feature({ intent: "organize", pilot: true })]))
      )
      .mockResolvedValueOnce(response(success([initialFeature])));

    render(
      <OwnerProductDiscovery
        organizationId={organizationId}
        locationId={locationId}
        role="owner"
      />
    );

    expect(await screen.findByText("En preparación")).toBeInTheDocument();
    expect(
      screen.getByText(/Si expresas interés, nos ayudas a priorizar/)
    ).toBeInTheDocument();
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));

    const getCall = mockFetch.mock.calls[0];
    expect(getCall?.[0]).toBe(
      "/api/v1/owner/product-discovery?organizationId=" +
        organizationId +
        "&locationId=" +
        locationId
    );
    expect((getCall?.[1] as RequestInit | undefined)?.method).toBeUndefined();
    expect(JSON.parse(String(mockFetch.mock.calls[1]?.[1]?.body))).toEqual({
      featureId: "club-events",
      action: "exposure",
    });

    await user.click(screen.getByRole("button", { name: "Ver propuesta" }));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(3));
    expect(JSON.parse(String(mockFetch.mock.calls[2]?.[1]?.body))).toEqual({
      featureId: "club-events",
      action: "open",
    });

    await user.click(
      screen.getByRole("radio", { name: "Organizar una competición" })
    );
    await user.click(
      screen.getByRole("checkbox", {
        name: "Quiero que consideren a mi academia para valorar un piloto.",
      })
    );
    await user.click(screen.getByRole("button", { name: "Me interesa" }));

    expect(await screen.findByText(/Has indicado interés/)).toBeInTheDocument();
    expect(
      JSON.parse(String(mockFetch.mock.calls[3]?.[1]?.body))
    ).toEqual({
      featureId: "club-events",
      action: "interest",
      intent: "organize",
      pilot: true,
    });

    await user.click(screen.getByRole("button", { name: "Retirar interés" }));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(5));
    expect(JSON.parse(String(mockFetch.mock.calls[4]?.[1]?.body))).toEqual({
      featureId: "club-events",
      action: "withdraw",
    });
    await waitFor(() =>
      expect(screen.queryByText(/Has indicado interés/)).not.toBeInTheDocument()
    );
    expect(
      screen.getByRole("radio", { name: "Organizar una competición" })
    ).not.toBeChecked();
    expect(
      screen.getByRole("checkbox", {
        name: "Quiero que consideren a mi academia para valorar un piloto.",
      })
    ).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Me interesa" })).toBeDisabled();
  });

  it("permite reintentar el catálogo y muestra el estado vacío sin inventar funciones", async () => {
    const user = userEvent.setup();
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) })
      .mockResolvedValueOnce(response(success([])));

    render(<OwnerProductDiscovery organizationId={organizationId} />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No pudimos cargar las propuestas"
    );
    await user.click(screen.getByRole("button", { name: "Volver a intentar" }));
    expect(
      await screen.findByText("No hay propuestas disponibles para este perfil.")
    ).toBeInTheDocument();
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("registra exposición solo cuando cada tarjeta entra en pantalla", async () => {
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
    const eventsFeature = feature();
    const acquisitionFeature = {
      ...feature(),
      id: "club-acquisition",
      title: "Captación web",
    };
    mockFetch
      .mockResolvedValueOnce(
        response(success([eventsFeature, acquisitionFeature]))
      )
      .mockResolvedValueOnce(
        response(success([eventsFeature, acquisitionFeature]))
      );

    render(<OwnerProductDiscovery organizationId={organizationId} />);
    await screen.findByText("Captación web");
    await waitFor(() => expect(observedCards).toHaveLength(2));
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const firstCard = observedCards[0];
    const callback = observerHarness.callback;
    if (!firstCard || !callback) throw new Error("observer_missing");
    const entry = {
      target: firstCard,
      isIntersecting: true,
      intersectionRatio: 1,
    } as IntersectionObserverEntry;
    callback([entry], {} as IntersectionObserver);
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
    expect(JSON.parse(String(mockFetch.mock.calls[1]?.[1]?.body))).toEqual({
      featureId: "club-events",
      action: "exposure",
    });

    callback([entry], {} as IntersectionObserver);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("permite leer propuestas sin enviar señales cuando la medición no está habilitada", async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValueOnce(response(success([feature()], false)));

    render(<OwnerProductDiscovery organizationId={organizationId} />);
    await user.click(
      await screen.findByRole("button", { name: "Conocer propuesta" })
    );

    expect(
      await screen.findByText("El registro de interés aún no está habilitado.")
    ).toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Me interesa" })).toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("limpia selección al cambiar de academia e ignora respuestas tardías del contexto anterior", async () => {
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
    const user = userEvent.setup();
    const oldOpen = {
      resolve: null as ((value: unknown) => void) | null,
    };
    const oldFeature = feature();
    const newFeature = { ...feature(), title: "Nueva propuesta" };
    mockFetch
      .mockResolvedValueOnce(response(success([oldFeature])))
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            oldOpen.resolve = resolve;
          })
      )
      .mockResolvedValueOnce(response(success([newFeature], true)))
      .mockResolvedValueOnce(response(success([newFeature], true)));

    const view = render(
      <OwnerProductDiscovery organizationId={organizationId} />
    );
    await user.click(
      await screen.findByRole("button", { name: "Ver propuesta" })
    );
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
    await user.click(
      screen.getByRole("radio", { name: "Organizar una competición" })
    );
    await user.click(
      screen.getByRole("checkbox", {
        name: "Quiero que consideren a mi academia para valorar un piloto.",
      })
    );

    view.rerender(
      <OwnerProductDiscovery
        organizationId="a0000000-0000-4000-8000-000000000009"
      />
    );
    expect(await screen.findByText("Nueva propuesta")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Ver propuesta" })
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Ver propuesta" }));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(4));
    expect(
      screen.getByRole("radio", { name: "Organizar una competición" })
    ).not.toBeChecked();
    expect(
      screen.getByRole("checkbox", {
        name: "Quiero que consideren a mi academia para valorar un piloto.",
      })
    ).not.toBeChecked();

    if (!oldOpen.resolve) throw new Error("open_request_missing");
    oldOpen.resolve(
      response(
        success([
          {
            ...feature({ intent: "organize", pilot: true }),
            title: "Propuesta anterior",
          },
        ])
      )
    );
    await waitFor(() =>
      expect(screen.queryByText("Propuesta anterior")).not.toBeInTheDocument()
    );
    expect(screen.getByText("Nueva propuesta")).toBeInTheDocument();
  });
});
