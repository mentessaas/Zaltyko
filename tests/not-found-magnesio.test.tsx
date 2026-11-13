// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import NotFound, { metadata } from "@/app/not-found";

afterEach(() => cleanup());

// 404 «Magnesio sobre tapiz»: banda de zona de seguridad con la marca,
// titular condensado y una sola acción principal en azul tapiz.
describe("404 (not-found)", () => {
  it("muestra marca, titular y las dos salidas con los colores del sistema", () => {
    render(<NotFound />);

    const main = screen.getByRole("main");
    const heading = screen.getByRole("heading", { level: 1, name: "Página no encontrada" });
    expect(main).toContainElement(heading);
    expect(heading.className).toContain("uppercase");
    expect(screen.getByText("404")).toBeInTheDocument();
    expect(screen.getByText("La página que estás buscando no existe o ha sido movida.")).toBeInTheDocument();

    expect(screen.getByRole("link", { name: "Zaltyko, inicio" })).toHaveAttribute("href", "/");
    const home = screen.getByRole("link", { name: "Ir al inicio" });
    expect(home).toHaveAttribute("href", "/");
    expect(home.className).toContain("bg-mat");
    const dashboard = screen.getByRole("link", { name: "Ir al dashboard" });
    expect(dashboard).toHaveAttribute("href", "/dashboard");
    expect(dashboard.className).toContain("border-ramp-300");

    expect(document.body.innerHTML).not.toMatch(/\b(?:bg|text)-(?:blue|gray|red)-\d{2,3}\b/);
  });

  it("sigue sin ser indexable", () => {
    expect(metadata.robots).toMatchObject({ index: false, follow: false, nocache: true });
  });
});
