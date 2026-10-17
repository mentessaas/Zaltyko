// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AuthPageShell } from "@/components/auth/AuthPageShell";

describe("AuthPageShell accessibility", () => {
  it("exposes the authentication task as the page main landmark", () => {
    render(
      <AuthPageShell
        title="Crea tu cuenta"
        description="Configura tu acceso personal."
        footer={<span>Inicia sesión</span>}
        sideTitle="Empieza por tu academia"
        sideDescription="Una descripción breve."
        highlights={[]}
      >
        <form aria-label="Crear cuenta">
          <label htmlFor="email">Correo electrónico</label>
          <input id="email" type="email" />
        </form>
      </AuthPageShell>
    );

    const main = screen.getByRole("main");
    expect(main).toContainElement(
      screen.getByRole("heading", { level: 1, name: "Crea tu cuenta" })
    );
    expect(main).toContainElement(
      screen.getByRole("form", { name: "Crear cuenta" })
    );
    expect(screen.getByRole("complementary")).toBeInTheDocument();
  });
});
