// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { OwnerAttentionPanel } from "@/components/owner-dashboard/OwnerAttentionPanel";
import type { OwnerAttentionItems } from "@/modules/owner-dashboard/application/attention-items";

afterEach(cleanup);

const organizationId = "00000000-0000-4000-8000-000000000001";
const locationId = "00000000-0000-4000-8000-000000000002";
const sessionId = "00000000-0000-4000-8000-0000000000a1";
const scopeQuery = new URLSearchParams({ organizationId, locationId }).toString();

function renderPanel(items: OwnerAttentionItems | null) {
  render(<OwnerAttentionPanel organizationId={organizationId} scopeQuery={scopeQuery} items={items} />);
  return screen.getByRole("region", { name: "Necesita tu atención" });
}

describe("OwnerAttentionPanel", () => {
  it("enlaza cada aviso con su pantalla y la lista sin pasar más reciente", () => {
    const region = renderPanel({
      unrecordedSessions: { count: 2, latest: { id: sessionId, locationId, className: "Rítmica iniciación" } },
      fullClasses: 1,
      overdueInvoices: 3,
    });

    expect(within(region).getByRole("link", { name: "Completar: 2 listas sin pasar" })).toHaveAttribute(
      "href",
      `/owner/attendance?organizationId=${organizationId}&locationId=${locationId}&sessionId=${sessionId}`
    );
    expect(within(region).getByText("Últimos 7 días · la más reciente: Rítmica iniciación")).toBeInTheDocument();
    expect(within(region).getByRole("link", { name: "Revisar: 3 cuotas vencidas" })).toHaveAttribute(
      "href",
      `/owner/monthly-invoices?${scopeQuery}`
    );
    expect(within(region).getByRole("link", { name: "Ver clases: 1 clase completa" })).toHaveAttribute(
      "href",
      `/owner/classes?${scopeQuery}`
    );
    expect(within(region).getByText("3")).toHaveTextContent("Avisos: 3");
  });

  it("no menciona cuotas cuando el rol no puede ver cobros", () => {
    const region = renderPanel({
      unrecordedSessions: { count: 0, latest: null },
      fullClasses: 0,
      overdueInvoices: null,
    });
    expect(within(region).getByText(/Todo al día/)).toHaveTextContent(
      "Todo al día: no hay listas sin pasar ni clases completas."
    );
    expect(within(region).queryByText(/cuota/)).toBeNull();
    expect(within(region).queryByRole("link")).toBeNull();
  });

  it("incluye las cuotas en el estado al día cuando se pueden ver", () => {
    const region = renderPanel({
      unrecordedSessions: { count: 0, latest: null },
      fullClasses: 0,
      overdueInvoices: 0,
    });
    expect(within(region).getByText(/Todo al día/)).toHaveTextContent("ni cuotas vencidas");
  });

  it("distingue una consulta fallida de no tener avisos", () => {
    const region = renderPanel(null);
    expect(within(region).getByRole("status")).toHaveTextContent("No significa que no haya ninguno");
    expect(within(region).queryByText(/Todo al día/)).toBeNull();
  });
});
