// @vitest-environment jsdom
import { StrictMode, useLayoutEffect, useRef } from "react";
import { renderToString } from "react-dom/server";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePendingCommandExitWarning } from "@/components/owner-dashboard/use-pending-command-exit-warning";

function Probe({ pending, label = "command" }: { pending: boolean; label?: string }) {
  const pendingRef = useRef<object | null>(pending ? {} : null);
  useLayoutEffect(() => { pendingRef.current = pending ? {} : null; }, [pending]);
  usePendingCommandExitWarning(pending, pendingRef);
  return <button onClick={() => { pendingRef.current = null; }}>{label}</button>;
}
function leavingPage() {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}
function ServerProbe() {
  const pendingRef = useRef<object | null>({});
  usePendingCommandExitWarning(true, pendingRef);
  return null;
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("aviso compartido de salida, no recuperación durable", () => {
  it("no registra un listener sin comandos pendientes", () => {
    const add = vi.spyOn(window, "addEventListener");
    render(<Probe pending={false} />);
    expect(add.mock.calls.filter(([name]) => name === "beforeunload")).toHaveLength(0);
    expect(leavingPage()).toBe(false);
  });

  it("varios comandos comparten un listener y resolver uno no elimina la protección del otro", () => {
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");
    const view = render(<><Probe pending label="A" /><Probe pending label="B" /></>);
    expect(add.mock.calls.filter(([name]) => name === "beforeunload")).toHaveLength(1);
    expect(leavingPage()).toBe(true);
    view.rerender(<><Probe pending={false} label="A" /><Probe pending label="B" /></>);
    expect(remove.mock.calls.filter(([name]) => name === "beforeunload")).toHaveLength(0);
    expect(leavingPage()).toBe(true);
    view.rerender(<><Probe pending={false} label="A" /><Probe pending={false} label="B" /></>);
    expect(remove.mock.calls.filter(([name]) => name === "beforeunload")).toHaveLength(1);
    expect(leavingPage()).toBe(false);
  });

  it("consulta la ref actual aunque el efecto todavía no haya limpiado el listener", () => {
    render(<Probe pending />);
    expect(leavingPage()).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "command" }));
    expect(leavingPage()).toBe(false);
  });

  it("mantiene una única suscripción activa con StrictMode y la retira al desmontar", () => {
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");
    const active = () => add.mock.calls.filter(([name]) => name === "beforeunload").length - remove.mock.calls.filter(([name]) => name === "beforeunload").length;
    const view = render(<StrictMode><Probe pending /></StrictMode>);
    expect(active()).toBe(1);
    expect(leavingPage()).toBe(true);
    view.unmount();
    expect(active()).toBe(0);
    expect(leavingPage()).toBe(false);
  });

  it("no registra suscripciones durante el render de servidor", () => {
    const add = vi.spyOn(window, "addEventListener");
    renderToString(<ServerProbe />);
    expect(add.mock.calls.filter(([name]) => name === "beforeunload")).toHaveLength(0);
    expect(leavingPage()).toBe(false);
  });
});
