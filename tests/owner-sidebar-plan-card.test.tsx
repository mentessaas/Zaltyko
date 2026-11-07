// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { OwnerSidebarPlanCard } from "@/components/owner-dashboard/OwnerSidebarPlanCard";
import { publishOwnerPlanUsage } from "@/components/owner-dashboard/owner-plan-usage-store";

afterEach(cleanup);

describe("OwnerSidebarPlanCard", () => {
  it("no muestra nada mientras el plan no se ha leído", () => {
    const { container } = render(
      <OwnerSidebarPlanCard organizationId="00000000-0000-4000-8000-0000000000f1" subscriptionHref="/owner/subscription" />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("muestra el plan, el aviso de solo lectura y el enlace solo si se permite", () => {
    const organizationId = "00000000-0000-4000-8000-0000000000f2";
    act(() => {
      publishOwnerPlanUsage(organizationId, { readOnly: true, planCode: "free" });
    });
    const { rerender } = render(
      <OwnerSidebarPlanCard organizationId={organizationId} subscriptionHref={`/owner/subscription?organizationId=${organizationId}`} />
    );
    expect(screen.getByText("Plan Free")).toBeInTheDocument();
    expect(screen.getByText(/Solo lectura/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver planes" })).toHaveAttribute(
      "href",
      `/owner/subscription?organizationId=${organizationId}`
    );

    rerender(<OwnerSidebarPlanCard organizationId={organizationId} subscriptionHref={null} />);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("no inventa nombre para un plan desconocido", () => {
    const organizationId = "00000000-0000-4000-8000-0000000000f3";
    act(() => {
      publishOwnerPlanUsage(organizationId, { readOnly: false, planCode: "legacy-custom" });
    });
    const { container } = render(<OwnerSidebarPlanCard organizationId={organizationId} subscriptionHref={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
