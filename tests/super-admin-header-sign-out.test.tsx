// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signOut: vi.fn(),
  push: vi.fn(),
  hasData: vi.fn(),
  clear: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
  usePathname: () => "/super-admin",
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { signOut: mocks.signOut } }),
}));
vi.mock("@/lib/offline-attendance/sign-out", () => ({
  hasOfflineAttendanceData: mocks.hasData,
  clearOfflineAttendanceOnSignOut: mocks.clear,
}));

import { SuperAdminHeader } from "@/app/(super-admin)/super-admin/components/SuperAdminHeader";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.signOut.mockResolvedValue({ error: null });
});
afterEach(cleanup);

function renderHeader() {
  render(<SuperAdminHeader userName="Admin" userEmail="admin@example.test" />);
  return screen.getAllByRole("button", { name: /Cerrar sesión/ })[0];
}

describe("cierre de sesión del encabezado de superadmin", () => {
  it("sin datos guardados cierra sin pasar por la limpieza", async () => {
    mocks.hasData.mockReturnValue(false);
    fireEvent.click(renderHeader());
    await act(async () => {});
    expect(mocks.clear).not.toHaveBeenCalled();
    expect(mocks.signOut).toHaveBeenCalledOnce();
    expect(mocks.push).toHaveBeenCalledWith("/auth/login");
  });

  it("con datos guardados limpia antes de cerrar la sesión", async () => {
    mocks.hasData.mockReturnValue(true);
    mocks.clear.mockResolvedValue(true);
    fireEvent.click(renderHeader());
    await act(async () => {});
    expect(mocks.clear).toHaveBeenCalledOnce();
    expect(mocks.clear.mock.invocationCallOrder[0]).toBeLessThan(mocks.signOut.mock.invocationCallOrder[0]);
    expect(mocks.push).toHaveBeenCalledWith("/auth/login");
  });

  it("si la persona cancela por las marcas sin enviar, no cierra la sesión", async () => {
    mocks.hasData.mockReturnValue(true);
    mocks.clear.mockResolvedValue(false);
    const button = renderHeader();
    fireEvent.click(button);
    await act(async () => {});
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
    expect(button).not.toBeDisabled();
  });
});
