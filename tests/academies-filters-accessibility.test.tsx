// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const routerPush = vi.hoisted(() => vi.fn());
const searchParams = vi.hoisted(() => new URLSearchParams());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush }),
  useSearchParams: () => searchParams,
}));

import { AcademiesFilters } from "@/components/public/AcademiesFilters";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  routerPush.mockClear();
  searchParams.forEach((_value, key) => searchParams.delete(key));
});

describe("filtros públicos de academias", () => {
  it("tienen nombres accesibles y cargan la geografía al avanzar por país y región", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<AcademiesFilters />);

    expect(
      screen.getByRole("textbox", { name: "Buscar academias por nombre" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Filtrar por modalidad" })
    ).toBeInTheDocument();

    const country = screen.getByRole("combobox", { name: "Filtrar por país" });
    const city = screen.getByRole("combobox", { name: "Filtrar por ciudad" });
    expect(country).toBeEnabled();
    expect(city).toBeDisabled();
    expect(city.querySelectorAll("option")).toHaveLength(1);
    expect(fetchMock).not.toHaveBeenCalled();

    await user.selectOptions(country, "ES");
    await waitFor(() =>
      expect(
        screen.getByRole("combobox", { name: "Filtrar por provincia" })
      ).toBeEnabled()
    );

    const region = screen.getByRole("combobox", {
      name: "Filtrar por provincia",
    });
    await user.selectOptions(region, "Andalucía");

    await waitFor(() => expect(city).toBeEnabled());
    await screen.findByRole("option", { name: "Almería" });
  });
});
