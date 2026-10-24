// @vitest-environment jsdom
import { StrictMode, type PropsWithChildren } from "react";
import { renderToString } from "react-dom/server";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useOrganizationDraftField } from "@/components/owner-dashboard/use-organization-draft-field";

afterEach(cleanup);

describe("borrador efímero por academia, nunca intención pendiente", () => {
  it("conserva el borrador y el setter al releer la misma academia", () => {
    const view = renderHook(({ organization, initial }) => useOrganizationDraftField(organization, initial), { initialProps: { organization: "A", initial: "inicial" } });
    const setter = view.result.current[1];
    act(() => setter("editado"));
    view.rerender({ organization: "A", initial: "otra respuesta" });
    expect(view.result.current[0]).toBe("editado");
    expect(view.result.current[1]).toBe(setter);
  });
  it("inicializa con los datos de la nueva academia sin copiar el borrador anterior", () => {
    const view = renderHook(({ organization, initial }) => useOrganizationDraftField(organization, initial), { initialProps: { organization: "A", initial: "fecha A" } });
    act(() => view.result.current[1]("fecha editada A"));
    view.rerender({ organization: "B", initial: "fecha B" });
    expect(view.result.current[0]).toBe("fecha B");
  });
  it("ignora callbacks tardíos de A mientras se muestra B", () => {
    const view = renderHook(({ organization }) => useOrganizationDraftField(organization, ""), { initialProps: { organization: "A" } });
    const old = view.result.current[1];
    view.rerender({ organization: "B" });
    act(() => view.result.current[1]("borrador B"));
    act(() => old("respuesta A"));
    expect(view.result.current[0]).toBe("borrador B");
  });
  it("frena también A → B → A y ni siquiera ejecuta el actualizador viejo", () => {
    const view = renderHook(({ organization }) => useOrganizationDraftField(organization, ""), { initialProps: { organization: "A" } });
    const old = view.result.current[1];
    view.rerender({ organization: "B" });
    view.rerender({ organization: "A" });
    act(() => view.result.current[1]("nuevo borrador A"));
    const staleUpdater = vi.fn(() => "viejo A");
    act(() => old(staleUpdater));
    expect(view.result.current[0]).toBe("nuevo borrador A");
    expect(staleUpdater).not.toHaveBeenCalled();
  });
  it("acumula actualizaciones funcionales dentro del mismo borrador", () => {
    const view = renderHook(() => useOrganizationDraftField("A", 0));
    act(() => { view.result.current[1](n => n + 1); view.result.current[1](n => n + 1); });
    expect(view.result.current[0]).toBe(2);
  });
  it("evalúa el inicializador solo al montar o cambiar academia", () => {
    const initial = vi.fn(() => ["valor inicial"]);
    const view = renderHook(({ organization }) => useOrganizationDraftField(organization, initial), { initialProps: { organization: "A" } });
    act(() => view.result.current[1](["edición"]));
    view.rerender({ organization: "A" });
    expect(initial).toHaveBeenCalledTimes(1);
    view.rerender({ organization: "B" });
    expect(initial).toHaveBeenCalledTimes(2);
    expect(view.result.current[0]).toEqual(["valor inicial"]);
  });
  it("mantiene el aislamiento en StrictMode", () => {
    const view = renderHook(({ organization }) => useOrganizationDraftField(organization, ""), {
      initialProps: { organization: "A" }, wrapper: ({ children }: PropsWithChildren) => <StrictMode>{children}</StrictMode>,
    });
    act(() => view.result.current[1]("dato A"));
    view.rerender({ organization: "B" });
    expect(view.result.current[0]).toBe("");
    act(() => view.result.current[1]("dato B"));
    expect(view.result.current[0]).toBe("dato B");
  });
  it("no necesita DOM ni efectos para la representación inicial del servidor", () => {
    function Draft() { const [value] = useOrganizationDraftField("A", "borrador"); return <p>{value}</p>; }
    expect(renderToString(<Draft />)).toBe("<p>borrador</p>");
  });
});
