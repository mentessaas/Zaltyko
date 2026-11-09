// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SearchableSelect } from "@/components/ui/searchable-select";
import { useCitiesByRegion } from "@/hooks/use-cities-by-region";
import { getLoadedCities } from "@/lib/geo-loader";

afterEach(cleanup);

/**
 * Same wiring as AcademyEditForm and the academy settings page: a city saved
 * before the country's list arrives must survive the empty first render.
 */
function SavedCityField({ onCityChange }: { onCityChange: (value: string) => void }) {
  const [city, setCity] = useState("malaga");
  const cityOptions = useCitiesByRegion("ES", "andalucia");
  return (
    <form aria-label="Academia">
      <SearchableSelect
        options={cityOptions}
        value={city}
        onChange={value => {
          onCityChange(value);
          setCity(value);
        }}
        placeholder="Selecciona ciudad"
        name="city"
      />
    </form>
  );
}

describe("saved city while the country list loads", () => {
  it("keeps the saved value, raises no change and shows its label once loaded", async () => {
    expect(getLoadedCities("es")).toBeNull();
    const onCityChange = vi.fn();
    const { container } = render(<SavedCityField onCityChange={onCityChange} />);
    const hidden = () => container.querySelector<HTMLInputElement>('input[type="hidden"][name="city"]');

    // First render: list not loaded yet, value intact, no validation text.
    expect(hidden()?.value).toBe("malaga");
    expect(screen.queryByText(/no válida|inválida|invalid/i)).toBeNull();

    await waitFor(() => expect(screen.getByText("Málaga")).toBeTruthy());
    expect(hidden()?.value).toBe("malaga");
    expect(onCityChange).not.toHaveBeenCalled();
  });
});
