import { describe, expect, it, vi } from "vitest";

const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});
const permanentRedirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});

vi.mock("next/navigation", () => ({ notFound, permanentRedirect }));

describe("ruta /[locale] de la web pública", () => {
  it("un primer segmento desconocido responde 404 y no redirige a la portada", async () => {
    const { default: LocaleHomePage } = await import("@/app/(site)/[locale]/page");
    await expect(LocaleHomePage({ params: Promise.resolve({ locale: "no-existe" }) })).rejects.toThrow(
      "NEXT_NOT_FOUND"
    );
    expect(permanentRedirect).not.toHaveBeenCalled();
  });

  it.each(["es", "en"])("/%s sigue siendo un alias permanente de la portada", async (locale) => {
    const { default: LocaleHomePage } = await import("@/app/(site)/[locale]/page");
    await expect(LocaleHomePage({ params: Promise.resolve({ locale }) })).rejects.toThrow("NEXT_REDIRECT:/");
  });
});
