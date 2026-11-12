// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Estabilidad del formulario de contacto (E2E inestable
 * tests/e2e-owner-local-setup.spec.ts, «acepta una solicitud sintética de
 * acceso asistido…»: `locator.check: Clicking the checkbox did not change its
 * state`). Causa: el formulario estaba dentro de <Reveal>, que lo pinta
 * desplazado 26px y lo sube con una transición de 0,6 s al hidratar; un clic en
 * ese intervalo caía en la casilla de al lado. También lo sufría quien rellenaba
 * el formulario mientras cargaba.
 */
const capture = vi.hoisted(() => vi.fn());
vi.mock("@/lib/growth/client", () => ({
  capturePublicGrowthEvent: capture,
  getPublicAttribution: () => ({}),
}));
vi.mock("@/app/(site)/Navbar", () => ({ default: function Navbar() { return null; } }));
vi.mock("@/app/(site)/Footer", () => ({ default: function Footer() { return null; } }));

import ContactPage from "@/app/contact/page";
import { ContactForm } from "@/components/contact/ContactForm";
import Reveal from "@/components/motion/Reveal";

beforeEach(() => {
  capture.mockReset();
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Devuelve la cadena de tipos de elemento desde la raíz hasta `target`. */
function pathTo(node: ReactNode, target: unknown, trail: unknown[] = []): unknown[] | null {
  if (!isValidElement(node)) return null;
  const element = node as ReactElement<{ children?: ReactNode }>;
  const here = [...trail, element.type];
  if (element.type === target) return here;
  for (const child of Children.toArray(element.props.children)) {
    const found = pathTo(child, target, here);
    if (found) return found;
  }
  return null;
}

describe("página de contacto", () => {
  it("el formulario no está dentro de una entrada animada (Reveal)", async () => {
    const page = await ContactPage({ searchParams: Promise.resolve({ type: "market_access" }) });
    const path = pathTo(page, ContactForm);
    expect(path).not.toBeNull();
    expect(path).not.toContain(Reveal);
    // La columna informativa conserva su entrada animada.
    expect(pathTo(page, Reveal)).not.toBeNull();
  });
});

describe("casillas de disciplina", () => {
  it("cada casilla tiene su etiqueta y un clic en el texto la marca", () => {
    render(<ContactForm defaultReason="market_access" />);
    const group = screen.getByRole("group", { name: "Disciplinas o actividades del club" });
    const rhythmic = screen.getByRole("checkbox", { name: "Rítmica" });
    expect(group).toContainElement(rhythmic);
    fireEvent.click(screen.getByText("Rítmica"));
    expect(rhythmic).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Otra actividad del club" })).not.toBeChecked();
  });

  it("la marca sobrevive a los renderizados del formulario (error de validación)", async () => {
    render(<ContactForm defaultReason="market_access" />);
    const rhythmic = screen.getByRole("checkbox", { name: "Rítmica" });
    fireEvent.click(rhythmic);
    expect(rhythmic).toBeChecked();
    // Enviar sin el resto de campos provoca un estado de error y un nuevo render.
    fireEvent.submit(screen.getByRole("form", { name: "Formulario de contacto" }));
    expect(screen.getByRole("checkbox", { name: "Rítmica" })).toBe(rhythmic);
    expect(rhythmic).toBeChecked();
  });
});
