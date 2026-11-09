// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DashboardRefreshNotice } from "@/components/dashboard/DashboardRefreshNotice";

afterEach(cleanup);

describe("aviso de actualización del dashboard", () => {
  it("explica que se conservan los datos anteriores y permite reintentar", () => {
    const onRetry = vi.fn();
    render(<DashboardRefreshNotice
      error="No se pudieron actualizar los datos del dashboard."
      loading={false}
      onRetry={onRetry}
    />);

    expect(screen.getByRole("alert")).toHaveTextContent("Seguimos mostrando la última información disponible.");
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("desactiva el reintento mientras la actualización está en curso", () => {
    render(<DashboardRefreshNotice error="Fallo temporal." loading onRetry={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Actualizando…" })).toBeDisabled();
  });
});
