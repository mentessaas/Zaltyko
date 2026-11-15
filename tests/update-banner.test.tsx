// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  UpdateBanner,
  UPDATE_BANNER_DISMISSED_KEY,
} from "@/components/ui/update-banner";

const activate = vi.hoisted(() => vi.fn());
const state = vi.hoisted(() => ({ available: true }));

vi.mock("@/hooks/useServiceWorker", () => ({
  useServiceWorker: () => ({
    registration: null,
    waitingWorker: state.available ? ({} as ServiceWorker) : null,
    update: vi.fn(),
    activate,
    isUpdateAvailable: state.available,
  }),
}));

beforeEach(() => {
  state.available = true;
  window.sessionStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe("UpdateBanner", () => {
  it("reserva espacio en la página mientras se ve y lo libera al cerrarlo", async () => {
    render(<UpdateBanner />);

    expect(await screen.findByText("Hay una versión nueva")).toBeTruthy();
    expect(document.body.getAttribute("data-update-banner")).toBe("visible");
    expect(
      document.documentElement.style.getPropertyValue("--update-banner-height"),
    ).toMatch(/px$/);

    await userEvent.click(screen.getByRole("button", { name: "Después" }));

    expect(screen.queryByText("Hay una versión nueva")).toBeNull();
    expect(document.body.hasAttribute("data-update-banner")).toBe(false);
    expect(
      document.documentElement.style.getPropertyValue("--update-banner-height"),
    ).toBe("");
  });

  it("no vuelve a aparecer en la sesión después de pulsar «Después»", async () => {
    const first = render(<UpdateBanner />);
    await userEvent.click(await screen.findByRole("button", { name: "Después" }));
    expect(window.sessionStorage.getItem(UPDATE_BANNER_DISMISSED_KEY)).toBe("1");
    first.unmount();

    // Otra navegación: el componente se monta de nuevo.
    render(<UpdateBanner />);
    expect(screen.queryByText("Hay una versión nueva")).toBeNull();
    expect(document.body.hasAttribute("data-update-banner")).toBe(false);
  });

  it("usa palabras sencillas, sin jerga", async () => {
    render(<UpdateBanner />);
    await screen.findByText("Hay una versión nueva");
    const text = document.body.textContent ?? "";
    expect(text).toContain("Actualiza para tener las mejoras");
    expect(text).not.toMatch(/funciones|disponible/i);
  });
});
