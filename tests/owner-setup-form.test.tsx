// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockReplace = vi.hoisted(() => vi.fn());
const mockRefresh = vi.hoisted(() => vi.fn());
const mockFetch = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, refresh: mockRefresh }),
}));

import { OwnerSetupForm } from "@/components/owner-dashboard/OwnerSetupForm";

beforeEach(() => {
  mockReplace.mockReset();
  mockRefresh.mockReset();
  mockFetch.mockReset();
  vi.stubGlobal("fetch", mockFetch);
  vi.stubGlobal("crypto", { randomUUID: () => "synthetic-bootstrap-key" });
});

afterEach(() => {
  cleanup();
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
        json: async () => ({ organizationId: "synthetic-organization" }),
      });

    render(<OwnerSetupForm />);
    await completeRequiredFields(user);
    await user.click(
      screen.getByRole("button", { name: "Crear espacio de dirección" })
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No podemos confirmar si se creó el espacio"
    );
    expect(screen.getByLabelText("Nombre de la academia")).toBeDisabled();
    const retryButton = screen.getByRole("button", {
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
    expect(mockReplace).toHaveBeenCalledWith(
      "/owner?organizationId=synthetic-organization"
    );
  });

  it("explica el resultado incierto de red y reintenta con la misma clave y payload", async () => {
    const user = userEvent.setup();
    mockFetch
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ organizationId: "synthetic-organization" }),
      });

    render(<OwnerSetupForm />);
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
      "/owner?organizationId=synthetic-organization"
    );
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
        json: async () => ({ organizationId: "synthetic-organization" }),
      });

    render(<OwnerSetupForm />);
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
});
