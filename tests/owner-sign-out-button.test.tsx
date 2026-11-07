// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ signOut: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => mocks }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { signOut: mocks.signOut } }),
}));
import { OwnerSignOutButton } from "@/components/owner-dashboard/OwnerSignOutButton";

beforeEach(() => { vi.resetAllMocks(); });
afterEach(cleanup);

describe("salida de la sesión Owner", () => {
  it("espera el cierre local antes de reemplazar la ruta privada y refrescarla", async () => {
    let finish!: (value: { error: null }) => void;
    mocks.signOut.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    render(<OwnerSignOutButton />);
    const button = screen.getByRole("button", { name: "Cerrar sesión" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(mocks.signOut).toHaveBeenCalledExactlyOnceWith({ scope: "local" });
    expect(button).toBeDisabled();
    expect(mocks.replace).not.toHaveBeenCalled();
    await act(async () => { finish({ error: null }); });
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith("/auth/login");
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it.each(["returned", "thrown"])("permite reintentar un fallo %s sin fingir que salió", async mode => {
    if (mode === "returned") mocks.signOut.mockResolvedValueOnce({ error: new Error("unavailable") });
    else mocks.signOut.mockRejectedValueOnce(new Error("unavailable"));
    mocks.signOut.mockResolvedValueOnce({ error: null });
    render(<OwnerSignOutButton />);
    fireEvent.click(screen.getByRole("button", { name: "Cerrar sesión" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo cerrar la sesión");
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar sesión" }));
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/auth/login"));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(mocks.signOut).toHaveBeenCalledTimes(2);
  });
});
