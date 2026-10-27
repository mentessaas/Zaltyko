// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { OwnerOperationalPolicy } from "@/components/owner-dashboard/OwnerOperationalPolicy";
import { useOwnerPlanPolicy } from "@/components/owner-dashboard/owner-plan-usage-store";
const fetchMock = vi.fn();
const org = "10000000-0000-4000-8000-000000000051";
function Probe() { const policy = useOwnerPlanPolicy(org); return <p data-testid="policy">{policy.status === "ready" ? policy.readOnly ? "blocked" : "writable" : policy.status}</p>; }
beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("loads only operational policy with site context and unlocks the operational store", async () => {
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true, data: { readOnly: false, planCode: "free" } }) });
  render(<><OwnerOperationalPolicy organizationId={org} locationId="site-qa" /><Probe /></>);
  await waitFor(() => expect(screen.getByTestId("policy")).toHaveTextContent("writable"));
  expect(fetchMock.mock.calls[0][0]).toContain("/operational-policy?");
  expect(fetchMock.mock.calls[0][0]).toContain("locationId=site-qa");
  expect(fetchMock.mock.calls[0][1].cache).toBe("no-store");
  expect(fetchMock.mock.calls.every(([url]) => !url.includes("/saas/usage"))).toBe(true);
});
it("fails closed and can recover without commercial access", async () => {
  fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ ok: false }) }).mockResolvedValue({ ok: true, json: async () => ({ ok: true, data: { readOnly: true, planCode: "free" } }) });
  render(<><OwnerOperationalPolicy organizationId={org} /><Probe /></>);
  await waitFor(() => expect(screen.getByTestId("policy")).toHaveTextContent("error"));
  fireEvent.click(screen.getByRole("button", { name: "Volver a consultar el uso" }));
  await waitFor(() => expect(screen.getByTestId("policy")).toHaveTextContent("blocked"));
  expect(screen.getByRole("status")).toHaveTextContent("persona Owner");
});
