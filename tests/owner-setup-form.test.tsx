// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockReplace = vi.hoisted(() => vi.fn());
const mockRefresh = vi.hoisted(() => vi.fn());
const mockFetch = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, refresh: mockRefresh }),
}));

import { OwnerSetupForm } from "@/components/owner-dashboard/OwnerSetupForm";

const freshSignupConsent = {
  policyVersion: "v1-2026-10-14",
  requiresAcceptance: false,
};
const setupReceipt = {
  organizationId: "a0000000-0000-4000-8000-000000000001",
  locationId: "a0000000-0000-4000-8000-000000000002",
  memberId: "a0000000-0000-4000-8000-000000000003",
};
const ownerUserId = "a0000000-0000-4000-8000-000000000004";

function retryStorageKey(userId: string) {
  return "zaltyko-owner-bootstrap-retry:v1:" + userId;
}

function renderFreshSignupForm() {
  return render(
    <OwnerSetupForm
      contractualConsent={freshSignupConsent}
      ownerUserId={ownerUserId}
    />
  );
}

beforeEach(() => {
  mockReplace.mockReset();
  mockRefresh.mockReset();
  mockFetch.mockReset();
  sessionStorage.clear();
  vi.stubGlobal("fetch", mockFetch);
  vi.stubGlobal("crypto", { randomUUID: () => "synthetic-bootstrap-key" });
});

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function completeRequiredFields(
  user: ReturnType<typeof userEvent.setup>
) {
  await user.type(
    screen.getByLabelText("Nombre de la academia"),
    "Club sintético"
  );
  await user.click(screen.getByLabelText("Gimnasia artística"));
  await user.type(
    screen.getByLabelText("Nombre de la primera sede"),
    "Sede sintética"
  );
}

describe("alta owner greenfield", () => {
  it("reintenta el mismo payload y mantiene bloqueados los campos tras resultado incierto", async () => {
    const user = userEvent.setup();
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({ detail: "Error temporal." }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => setupReceipt,
      });

    const view = renderFreshSignupForm();
    expect(
      screen.queryByRole("checkbox", {
        name: /Acepto los términos y condiciones y he leído la política de privacidad/,
      })
    ).not.toBeInTheDocument();
    await completeRequiredFields(user);
    await user.click(
      screen.getByRole("button", { name: "Crear espacio de dirección" })
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No podemos confirmar si se creó el espacio"
    );
    expect(screen.getByLabelText("Nombre de la academia")).toBeDisabled();
    expect(
      sessionStorage.getItem(retryStorageKey(ownerUserId))
    ).not.toBeNull();
    view.unmount();

    renderFreshSignupForm();
    const academyName = await screen.findByLabelText("Nombre de la academia");
    expect(academyName).toHaveValue("Club sintético");
    const retryButton = await screen.findByRole("button", {
      name: "Reintentar el mismo envío",
    });
    await user.click(retryButton);

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
    const first = mockFetch.mock.calls[0]?.[1] as RequestInit;
    const retry = mockFetch.mock.calls[1]?.[1] as RequestInit;
    expect(retry.headers).toEqual(first.headers);
    expect(retry.body).toBe(first.body);
    expect(first.headers).toMatchObject({
      "idempotency-key": "synthetic-bootstrap-key",
    });
    expect(JSON.parse(String(first.body))).toMatchObject({
      organizationName: "Club sintético",
      locationName: "Sede sintética",
      primaryDiscipline: "artistic",
      countryCode: "ES",
    });
    expect(JSON.parse(String(first.body))).not.toHaveProperty("defaultCurrency");
    expect(JSON.parse(String(first.body))).not.toHaveProperty("timezone");
    expect(JSON.parse(String(first.body))).not.toHaveProperty(
      "contractualAcceptance"
    );
    expect(mockReplace).toHaveBeenCalledWith(
      `/owner?organizationId=${setupReceipt.organizationId}`
    );
    expect(sessionStorage.getItem(retryStorageKey(ownerUserId))).toBeNull();
  });

  it("explica el resultado incierto de red y reintenta con la misma clave y payload", async () => {
    const user = userEvent.setup();
    mockFetch
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => setupReceipt,
      });

    renderFreshSignupForm();
    await completeRequiredFields(user);
    await user.click(
      screen.getByRole("button", { name: "Crear espacio de dirección" })
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "No podemos confirmar si se creó el espacio. Reintenta este mismo envío"
    );
    expect(alert).not.toHaveTextContent("Failed to fetch");
    expect(screen.getByLabelText("Nombre de la academia")).toBeDisabled();
    await user.click(
      screen.getByRole("button", { name: "Reintentar el mismo envío" })
    );

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
    const first = mockFetch.mock.calls[0]?.[1] as RequestInit;
    const retry = mockFetch.mock.calls[1]?.[1] as RequestInit;
    expect(retry.headers).toEqual(first.headers);
    expect(retry.body).toBe(first.body);
    expect(first.headers).toMatchObject({
      "idempotency-key": "synthetic-bootstrap-key",
    });
    expect(mockReplace).toHaveBeenCalledWith(
      `/owner?organizationId=${setupReceipt.organizationId}`
    );
  });

  it("conserva el recibo original si el reintento tras una respuesta incierta da 403", async () => {
    const user = userEvent.setup();
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({}),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({ detail: "No autorizado." }),
      });

    renderFreshSignupForm();
    await completeRequiredFields(user);
    await user.click(
      screen.getByRole("button", { name: "Crear espacio de dirección" })
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No podemos confirmar si se creó el espacio"
    );
    await user.click(
      screen.getByRole("button", { name: "Reintentar el mismo envío" })
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("No podemos confirmar el resultado");
    expect(alert).not.toHaveTextContent("No autorizado.");
    expect(
      sessionStorage.getItem(retryStorageKey(ownerUserId))
    ).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "Reintentar el mismo envío" })
    ).toBeEnabled();
    expect(mockFetch).toHaveBeenCalledTimes(2);
    const first = mockFetch.mock.calls[0]?.[1] as RequestInit;
    const retry = mockFetch.mock.calls[1]?.[1] as RequestInit;
    expect(retry.headers).toEqual(first.headers);
    expect(retry.body).toBe(first.body);
  });

  it("permite corregir un rechazo definitivo con una clave nueva", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("crypto", {
      randomUUID: vi
        .fn()
        .mockReturnValueOnce("synthetic-bootstrap-key-1")
        .mockReturnValueOnce("synthetic-bootstrap-key-2"),
    });
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 422,
        json: async () => ({ detail: "Revisa los datos." }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => setupReceipt,
      });

    renderFreshSignupForm();
    await completeRequiredFields(user);
    await user.click(
      screen.getByRole("button", { name: "Crear espacio de dirección" })
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Revisa los datos."
    );

    const academyName = screen.getByLabelText("Nombre de la academia");
    await user.clear(academyName);
    await user.type(academyName, "Otro club sintético");
    await user.click(
      screen.getByRole("button", { name: "Crear espacio de dirección" })
    );

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
    const first = mockFetch.mock.calls[0]?.[1] as RequestInit;
    const second = mockFetch.mock.calls[1]?.[1] as RequestInit;
    expect(first.headers).toMatchObject({
      "idempotency-key": "synthetic-bootstrap-key-1",
    });
    expect(second.headers).toMatchObject({
      "idempotency-key": "synthetic-bootstrap-key-2",
    });
    expect(JSON.parse(String(second.body))).toMatchObject({
      organizationName: "Otro club sintético",
    });
  });

  it("envía país, moneda y zona horaria de México y conserva el mismo intento incierto", async () => {
    const user = userEvent.setup();
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({ detail: "Respuesta temporal." }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => setupReceipt,
      });

    const view = renderFreshSignupForm();
    await user.selectOptions(
      screen.getByLabelText("País de la academia"),
      "MX"
    );
    await user.selectOptions(
      screen.getByLabelText("Zona horaria de la primera sede"),
      "America/Monterrey"
    );
    expect(
      screen.getByText(/gestión administrativa en México está en validación/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/es independiente de la contratación SaaS/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /contratación comercial para México aún no está habilitada/i
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(/No incluye funciones federativas mexicanas/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/no emite comprobantes fiscales mexicanos/)
    ).toBeInTheDocument();
    await completeRequiredFields(user);
    await user.click(
      screen.getByRole("button", { name: "Crear espacio de dirección" })
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No podemos confirmar si se creó el espacio"
    );
    const academyName = screen.getByLabelText("Nombre de la academia");
    expect(academyName).toBeDisabled();
    view.unmount();

    renderFreshSignupForm();
    expect(
      await screen.findByLabelText("País de la academia")
    ).toHaveValue("MX");
    expect(
      screen.getByLabelText("Zona horaria de la primera sede")
    ).toHaveValue("America/Monterrey");
    await user.click(
      await screen.findByRole("button", { name: "Reintentar el mismo envío" })
    );

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
    const first = mockFetch.mock.calls[0]?.[1] as RequestInit;
    const retry = mockFetch.mock.calls[1]?.[1] as RequestInit;
    expect(retry.headers).toEqual(first.headers);
    expect(retry.body).toBe(first.body);
    expect(JSON.parse(String(first.body))).toMatchObject({
      countryCode: "MX",
      defaultCurrency: "MXN",
      timezone: "America/Monterrey",
    });
    expect(sessionStorage.getItem(retryStorageKey(ownerUserId))).toBeNull();
  });

  it("mantiene el alta española compatible y envía una zona horaria alternativa si se elige", async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => setupReceipt,
    });

    renderFreshSignupForm();
    await user.selectOptions(
      screen.getByLabelText("Zona horaria de la primera sede"),
      "Atlantic/Canary"
    );
    await completeRequiredFields(user);
    await user.click(
      screen.getByRole("button", { name: "Crear espacio de dirección" })
    );

    await waitFor(() => expect(mockFetch).toHaveBeenCalledOnce());
    const body = JSON.parse(String(mockFetch.mock.calls[0]?.[1]?.body));
    expect(body).toMatchObject({
      countryCode: "ES",
      timezone: "Atlantic/Canary",
    });
    expect(body).not.toHaveProperty("defaultCurrency");
  });

  it("no expone ni reutiliza el intento pendiente de otra cuenta", async () => {
    const user = userEvent.setup();
    const firstUserId = "a0000000-0000-4000-8000-000000000014";
    const secondUserId = "a0000000-0000-4000-8000-000000000015";
    mockFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    const firstView = render(
      <OwnerSetupForm
        contractualConsent={freshSignupConsent}
        ownerUserId={firstUserId}
      />
    );
    await completeRequiredFields(user);
    await user.click(
      screen.getByRole("button", { name: "Crear espacio de dirección" })
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No podemos confirmar si se creó el espacio"
    );
    expect(
      sessionStorage.getItem(retryStorageKey(firstUserId))
    ).not.toBeNull();
    firstView.unmount();

    render(
      <OwnerSetupForm
        contractualConsent={freshSignupConsent}
        ownerUserId={secondUserId}
      />
    );
    expect(
      await screen.findByLabelText("Nombre de la academia")
    ).toHaveValue("");
    expect(
      screen.getByRole("button", { name: "Crear espacio de dirección" })
    ).toBeEnabled();
    expect(mockFetch).toHaveBeenCalledOnce();
    expect(
      sessionStorage.getItem(retryStorageKey(firstUserId))
    ).not.toBeNull();
  });

  it("descarta un DTO de reintento malformado sin enviarlo automáticamente", async () => {
    sessionStorage.setItem(
      retryStorageKey(ownerUserId),
      JSON.stringify({
        version: 2,
        ownerUserId,
        key: "malformed-key",
        serializedBody: "{}",
      })
    );

    renderFreshSignupForm();

    expect(
      await screen.findByText(/No pudimos validar un intento guardado/)
    ).toBeInTheDocument();
    expect(sessionStorage.getItem(retryStorageKey(ownerUserId))).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Crear espacio de dirección" })
    ).toBeEnabled();
  });

  it("avisa si el navegador bloquea el recibo y conserva el reintento en memoria", async () => {
    const user = userEvent.setup();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({}),
    });

    renderFreshSignupForm();
    await completeRequiredFields(user);
    await user.click(
      screen.getByRole("button", { name: "Crear espacio de dirección" })
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No podemos confirmar si se creó el espacio"
    );
    expect(
      screen.getByText(/el reintento solo se conserva mientras esta página permanezca abierta/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Reintentar el mismo envío" })
    ).toBeEnabled();
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it("falla cerrada cuando no se pudo leer el estado contractual", () => {
    render(<OwnerSetupForm />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "No pudimos comprobar los términos vigentes de tu cuenta"
    );
    expect(
      screen.queryByRole("button", { name: "Crear espacio de dirección" })
    ).not.toBeInTheDocument();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("pide aceptación solo si hace falta y envía la versión entregada por el servidor", async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => setupReceipt,
    });
    render(
      <OwnerSetupForm
        contractualConsent={{
          policyVersion: "v2-2026-10-14",
          requiresAcceptance: true,
        }}
      />
    );
    await completeRequiredFields(user);

    const consentCheckbox = screen.getByRole("checkbox", {
      name: /Acepto los términos y condiciones y he leído la política de privacidad/,
    });
    expect(consentCheckbox).not.toBeChecked();
    expect(consentCheckbox).toBeRequired();
    expect(
      screen.getByRole("link", { name: "términos y condiciones" })
    ).toHaveAttribute("href", "/terminos");
    expect(
      screen.getByRole("link", { name: "política de privacidad" })
    ).toHaveAttribute("href", "/politica-privacidad");

    await user.click(
      screen.getByRole("button", { name: "Crear espacio de dirección" })
    );
    expect(mockFetch).not.toHaveBeenCalled();

    await user.click(consentCheckbox);
    await user.click(
      screen.getByRole("button", { name: "Crear espacio de dirección" })
    );

    await waitFor(() => expect(mockFetch).toHaveBeenCalledOnce());
    const body = JSON.parse(String(mockFetch.mock.calls[0]?.[1]?.body));
    expect(body.contractualAcceptance).toEqual({
      accepted: true,
      policyVersion: "v2-2026-10-14",
    });
  });

  it("mantiene la vista previa sin aceptar ni enviar aunque se fuerce el submit", () => {
    render(
      <OwnerSetupForm
        contractualConsent={{
          policyVersion: "preview-synthetic",
          requiresAcceptance: true,
        }}
        previewOnly
      />
    );

    const consentCheckbox = screen.getByRole("checkbox", {
      name: /Acepto los términos y condiciones y he leído la política de privacidad/,
    });
    const submitButton = screen.getByRole("button", {
      name: "Crear espacio de dirección",
    });

    expect(consentCheckbox).not.toBeChecked();
    expect(consentCheckbox).toBeDisabled();
    expect(submitButton).toBeDisabled();

    const form = submitButton.closest("form");
    expect(form).not.toBeNull();
    if (form) fireEvent.submit(form);

    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockRefresh).not.toHaveBeenCalled();
    expect(consentCheckbox).not.toBeChecked();
  });
});
