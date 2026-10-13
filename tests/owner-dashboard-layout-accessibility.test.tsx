/** @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";

import {
  DashboardModule,
  DashboardModuleLayout,
} from "@/components/owner-dashboard/DashboardModuleLayout";

describe("owner dashboard layout accessibility", () => {
  it("exposes named drag and one-step reorder controls with Spanish instructions", () => {
    render(
      <DashboardModuleLayout
        organizationId="org-synthetic"
        initialOrder={["kpis", "trends"]}
        initialVersion={0}
      >
        <DashboardModule moduleId="kpis" title="Indicadores">
          <p>Resumen</p>
        </DashboardModule>
        <DashboardModule moduleId="trends" title="Tendencias">
          <p>Evolución</p>
        </DashboardModule>
      </DashboardModuleLayout>
    );

    expect(
      screen.getByRole("button", {
        name: "Arrastrar Indicadores para cambiar su posición",
      })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Subir Indicadores" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bajar Indicadores" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restablecer orden" })).toBeInTheDocument();
    expect(screen.getAllByRole("status")).toHaveLength(2);
    expect(document.body.textContent).toContain(
      "Para mover un módulo, pulsa espacio. Usa las flechas"
    );
  });
});
