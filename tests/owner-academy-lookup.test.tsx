// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OwnerAcademyLookup } from "@/components/onboarding/OwnerAcademyLookup";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("Buscar academia durante onboarding", () => {
  it("filtra por región y ciudad, y solo revisa esa ubicación", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ total: 0, items: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const reviewed = vi.fn();
    render(
      <OwnerAcademyLookup
        name="Academia QA"
        countryCode="es"
        region="Comunidad de Madrid"
        city="Madrid"
        onReviewed={reviewed}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Buscar mi academia" }));
    await screen.findByText(
      "No encontramos coincidencias en los perfiles públicos disponibles. Puedes continuar con el alta; el servidor volverá a comprobar que no exista ya un espacio con esos datos."
    );

    const requestUrl = new URL(
      fetchMock.mock.calls[0][0],
      "https://zaltyko.test"
    );
    expect(requestUrl.pathname).toBe("/api/public/academies");
    expect(requestUrl.searchParams.get("region")).toBe("Comunidad de Madrid");
    expect(requestUrl.searchParams.get("city")).toBe("Madrid");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(reviewed).toHaveBeenCalledWith(
      JSON.stringify(["Academia QA", "es", "Comunidad de Madrid", "Madrid"])
    );
  });

  it("no concede continuidad si la búsqueda falla", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ message: "No se pudo comprobar" }),
      })
    );
    const reviewed = vi.fn();
    render(
      <OwnerAcademyLookup
        name="Academia QA"
        countryCode="es"
        city="Madrid"
        onReviewed={reviewed}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Buscar mi academia" }));
    await screen.findByText("No se pudo comprobar");
    expect(reviewed).not.toHaveBeenCalled();
  });
  it("usa perfiles públicos operativos si el endpoint del directorio está desactivado", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ code: "DISABLED", error: "DISABLED" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          total: 1,
          items: [
            {
              id: "academy-123",
              name: "Club Público",
              country: "España",
              region: "Madrid",
              city: "Madrid",
            },
          ],
        }),
      });
    vi.stubGlobal("fetch", fetchMock);
    const reviewed = vi.fn();
    render(
      <OwnerAcademyLookup
        name="Club Público"
        countryCode="es"
        region="Madrid"
        city="Madrid"
        onReviewed={reviewed}
        directoryEnabled
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Buscar mi academia" }));

    expect(await screen.findByText("Club Público")).toBeTruthy();
    expect(
      screen.getByText(/solo muestra academias con perfil público operativo/)
    ).toBeTruthy();
    expect(
      screen.getByText(/Las reclamaciones todavía no están activas/)
    ).toBeTruthy();
    expect(
      screen.queryByText(/puedes solicitar gestionarla gratis/)
    ).toBeNull();
    expect(
      screen.getByRole("link", { name: "Abrir ficha pública" })
    ).toHaveAttribute("href", "/academias/academy-123");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const publicRequest = new URL(
      fetchMock.mock.calls[1][0],
      "https://zaltyko.test"
    );
    expect(publicRequest.pathname).toBe("/api/public/academies");
    expect(publicRequest.searchParams.get("country")).toBe("es");
    expect(publicRequest.searchParams.get("region")).toBe("Madrid");
    expect(publicRequest.searchParams.get("city")).toBe("Madrid");
    expect(reviewed).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Ninguna corresponde a mi sede; continuar",
      })
    );
    expect(reviewed).toHaveBeenCalledWith(
      JSON.stringify(["Club Público", "es", "Madrid", "Madrid"])
    );
  });
  it("ofrece reclamar la ficha externa sin crear otra academia", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            items: [
              {
                id: "00000000-0000-4000-8000-000000000001",
                kind: "academy",
                slug: "academia-qa",
                academyId: null,
                eventId: null,
                data: {
                  name: "Academia QA",
                  city: "Madrid",
                  countryCode: "ES",
                },
              },
            ],
          },
        }),
      })
    );
    const reviewed = vi.fn();
    render(
      <OwnerAcademyLookup
        name="Academia QA"
        countryCode="es"
        city="Madrid"
        onReviewed={reviewed}
        directoryEnabled
        claimsEnabled
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Buscar mi academia" }));
    const link = await screen.findByRole("link", {
      name: "Revisar ficha y solicitar reclamación",
    });
    expect(link.getAttribute("href")).toBe(
      "/academias/00000000-0000-4000-8000-000000000001-academia-qa"
    );
    expect(reviewed).not.toHaveBeenCalled();
  });
  it("when claims are disabled, offers support instead of promising a claim", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            items: [
              {
                id: "00000000-0000-4000-8000-000000000001",
                kind: "academy",
                slug: "academia-qa",
                academyId: null,
                eventId: null,
                data: {
                  name: "Academia QA",
                  city: "Madrid",
                  countryCode: "ES",
                },
              },
            ],
          },
        }),
      })
    );
    const reviewed = vi.fn();
    render(
      <OwnerAcademyLookup
        name="Academia QA"
        countryCode="es"
        city="Madrid"
        onReviewed={reviewed}
        directoryEnabled
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Buscar mi academia" }));
    expect(
      await screen.findByRole("link", { name: "Revisar ficha" })
    ).toHaveAttribute(
      "href",
      "/academias/00000000-0000-4000-8000-000000000001-academia-qa"
    );
    expect(
      screen.getByRole("link", {
        name: "Solicitar ayuda para vincular esta academia",
      })
    ).toHaveAttribute(
      "href",
      "/contact?type=support&directoryEntryId=00000000-0000-4000-8000-000000000001"
    );
    expect(
      screen.getByText(/Las reclamaciones todavía no están activas/)
    ).toBeTruthy();
  });
  it("una respuesta antigua no valida los datos de otra sede", async () => {
    let resolve!: (value: unknown) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockReturnValue(
        new Promise((r) => {
          resolve = r;
        })
      )
    );
    const reviewed = vi.fn();
    const { rerender } = render(
      <OwnerAcademyLookup
        name="Academia QA"
        countryCode="es"
        city="Madrid"
        onReviewed={reviewed}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Buscar mi academia" }));
    rerender(
      <OwnerAcademyLookup
        name="Academia QA"
        countryCode="pe"
        city="Lima"
        onReviewed={reviewed}
      />
    );
    resolve({ ok: true, json: async () => ({ data: { items: [] } }) });
    await waitFor(() =>
      expect(reviewed).toHaveBeenCalledWith(
        JSON.stringify(["Academia QA", "es", "", "Madrid"])
      )
    );
    expect(reviewed).not.toHaveBeenCalledWith(
      JSON.stringify(["Academia QA", "pe", "", "Lima"])
    );
    expect(
      screen.getByText(
        "Has cambiado los datos de la sede. Repite la búsqueda antes de continuar."
      )
    ).toBeTruthy();
  });
});
