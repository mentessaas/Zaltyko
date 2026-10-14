// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const notFound = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  })
);
const replace = vi.hoisted(() => vi.fn());
const refresh = vi.hoisted(() => vi.fn());
const dbSelect = vi.hoisted(() => vi.fn());
const createClient = vi.hoisted(() => vi.fn());
const getConsentRequirement = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  notFound,
  useRouter: () => ({ replace, refresh }),
}));

vi.mock("@/db", () => ({
  db: { select: dbSelect },
}));

vi.mock("@/lib/supabase/server", () => ({ createClient }));

vi.mock("@/modules/organizations/application/owner-signup-consent", () => ({
  getOwnerContractualConsentRequirement: getConsentRequirement,
}));

import OwnerSetupPreviewPage from "@/app/owner/setup/preview/page";

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "test");
  notFound.mockClear();
  replace.mockClear();
  refresh.mockClear();
  dbSelect.mockClear();
  createClient.mockClear();
  getConsentRequirement.mockClear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("vista previa de Owner Setup", () => {
  it("muestra el formulario sintético y no consulta Auth, consentimiento ni base de datos", () => {
    render(<OwnerSetupPreviewPage />);

    expect(
      screen.getByRole("heading", { name: "Crea tu academia" })
    ).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent(
      "No se creará ninguna academia ni se guardará tu aceptación de los términos."
    );
    expect(
      screen.getByRole("checkbox", {
        name: /Acepto los términos y condiciones y he leído la política de privacidad/,
      })
    ).not.toBeChecked();
    expect(
      screen.getByRole("button", { name: "Crear espacio de dirección" })
    ).toBeDisabled();
    expect(createClient).not.toHaveBeenCalled();
    expect(getConsentRequirement).not.toHaveBeenCalled();
    expect(dbSelect).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("devuelve 404 en producción", () => {
    vi.stubEnv("NODE_ENV", "production");

    expect(() => OwnerSetupPreviewPage()).toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalledOnce();
  });
});
