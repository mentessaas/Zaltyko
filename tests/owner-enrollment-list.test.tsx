// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OwnerEnrollmentList } from "@/components/owner-dashboard/OwnerEnrollmentList";

type Props = Parameters<typeof OwnerEnrollmentList>[0];
const site = "synthetic-site-a";
const enrollment: Props["bundle"]["enrollments"][number] = {
  id: "synthetic-enrollment", athleteId: "synthetic-athlete", givenName: "Ana",
  preferredName: null, familyName: "Sintética", athleteName: "Ana Sintética",
  status: "active", startsOn: "2026-10-01", endsOn: null, version: 2,
  classTemplateId: "synthetic-class", className: "Clase A", locationId: site,
  locationName: "Sede A", programName: null,
};
const bundle: Props["bundle"] = {
  organization: { id: "synthetic-org", name: "Academia sintética", defaultCurrency: "EUR" },
  member: { id: "synthetic-member", role: "owner", locationScopeMode: "all" },
  locations: [{ id: site, name: "Sede A", timezone: "Europe/Madrid" }, { id: "synthetic-site-b", name: "Sede B", timezone: "Europe/Madrid" }],
  programs: [], classes: [], enrollments: [], totalsByStatus: {}, total: 0,
  page: 1, pages: 1, pageSize: 50, selectedLocationId: site, filterLocationId: site,
  localTodayByLocation: { [site]: "2026-10-22" },
};
function setup(overrides: Partial<Props> = {}) {
  const props: Props = {
    bundle, selectedStatus: "active", previewMode: false, createOpen: false,
    busyId: "", confirmingCancelId: "", confirmingCompleteId: "", error: "", notice: "",
    onApplyFilters: vi.fn(), onOpenCreate: vi.fn(), onConfirmCancel: vi.fn(),
    onConfirmComplete: vi.fn(), onChangeStatus: vi.fn(), ...overrides,
  };
  render(<OwnerEnrollmentList {...props} />);
  return props;
}
function withEnrollment(extra: Partial<Props["bundle"]> = {}): Props["bundle"] {
  return { ...bundle, enrollments: [enrollment], total: 1, ...extra };
}
function setupInteractiveConfirmation() {
  const props: Props = {
    bundle: withEnrollment(), selectedStatus: "all", previewMode: false,
    createOpen: false, busyId: "", confirmingCancelId: "", confirmingCompleteId: "",
    error: "", notice: "", onApplyFilters: vi.fn(), onOpenCreate: vi.fn(),
    onConfirmCancel: vi.fn(), onConfirmComplete: vi.fn(), onChangeStatus: vi.fn(),
  };
  function InteractiveList() {
    const [confirmingCancelId, setConfirmingCancelId] = useState("");
    const [confirmingCompleteId, setConfirmingCompleteId] = useState("");
    return (
      <OwnerEnrollmentList
        {...props}
        confirmingCancelId={confirmingCancelId}
        confirmingCompleteId={confirmingCompleteId}
        onConfirmCancel={setConfirmingCancelId}
        onConfirmComplete={setConfirmingCompleteId}
      />
    );
  }
  render(<InteractiveList />);
}
afterEach(cleanup);

describe("lista de inscripciones: navegación explícita y contexto", () => {
  it("quitar el filtro de estado conserva la sede y no escribe", () => {
    const props = setup();
    fireEvent.click(screen.getByRole("button", { name: "Ver todos los estados" }));
    expect(props.onApplyFilters).toHaveBeenCalledExactlyOnceWith("all", site);
    expect(props.onOpenCreate).not.toHaveBeenCalled();
    expect(props.onChangeStatus).not.toHaveBeenCalled();
  });
  it("ampliar a mis sedes conserva el estado y requiere una acción", () => {
    const props = setup();
    expect(props.onApplyFilters).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Ver todas mis sedes" }));
    expect(props.onApplyFilters).toHaveBeenCalledExactlyOnceWith("active", "all");
    expect(props.onChangeStatus).not.toHaveBeenCalled();
  });
  it("no ofrece quitar filtros ya ausentes ni afirma ausencia global", () => {
    setup({ selectedStatus: "all", bundle: { ...bundle, filterLocationId: null } });
    expect(screen.queryByRole("button", { name: "Ver todos los estados" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ver todas mis sedes" })).not.toBeInTheDocument();
    expect(screen.getByText(/No hay resultados con los filtros actuales/)).toBeVisible();
  });
  it("no duplica la apertura de un formulario que ya está visible", () => {
    setup({ createOpen: true });
    expect(screen.queryByRole("button", { name: "Nueva inscripción" })).not.toBeInTheDocument();
  });
  it("el ejemplo vacío no permite navegar filtros ni abrir un alta", () => {
    const props = setup({ previewMode: true });
    for (const button of screen.getAllByRole("button")) {
      expect(button).toBeDisabled(); fireEvent.click(button);
    }
    expect(props.onApplyFilters).not.toHaveBeenCalled();
    expect(props.onOpenCreate).not.toHaveBeenCalled();
  });
  it("la paginación conserva organización, sede y estado", () => {
    setup({ bundle: withEnrollment({ page: 2, pages: 3, total: 120 }) });
    const navigation = screen.getByRole("navigation", { name: "Páginas de inscripciones" });
    expect(within(navigation).getByText("Página 2 de 3")).toBeVisible();
    for (const [name, page, rel] of [[/Anterior:/, null, "prev"], [/Siguiente:/, "3", "next"]] as const) {
      const link = within(navigation).getByRole("link", { name });
      const url = new URL(link.getAttribute("href")!, "https://synthetic.invalid");
      expect(url.pathname).toBe("/owner/enrollments");
      expect(Object.fromEntries(url.searchParams)).toEqual({ organizationId: "synthetic-org", locationId: site, status: "active", ...(page ? { page } : {}) });
      expect(link).toHaveAttribute("rel", rel);
    }
  });
  it.each([[1, /Anterior:/], [3, /Siguiente:/]] as const)("no enlaza fuera del rango desde la página %s", (page, name) => {
    setup({ bundle: withEnrollment({ page, pages: 3 }) });
    expect(screen.queryByRole("link", { name })).not.toBeInTheDocument();
  });
  it("el ejemplo paginado no enlaza al listado operativo", () => {
    setup({ previewMode: true, bundle: withEnrollment({ page: 2, pages: 3 }) });
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("Página 2 de 3")).toBeVisible();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
  it("distingue dos inscripciones de la misma gimnasta por clase y sede", () => {
    setup({ bundle: withEnrollment({ enrollments: [enrollment, { ...enrollment, id: "second", className: "Clase B", locationName: "Sede B" }] }) });
    expect(screen.getByRole("button", { name: "Pausar inscripción de Ana Sintética · Clase A · Sede A" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Pausar inscripción de Ana Sintética · Clase B · Sede B" })).toBeVisible();
  });
  it.each(["cancelled", "completed"] as const)("confirmar %s mantiene exactamente el destinatario y estado", status => {
    const cancel = status === "cancelled";
    const props = setup({ bundle: withEnrollment(), ...(cancel ? { confirmingCancelId: enrollment.id } : { confirmingCompleteId: enrollment.id }) });
    const name = `${cancel ? "Confirmar baja" : "Confirmar finalización"} de Ana Sintética · Clase A · Sede A`;
    const group = screen.getByRole("group", { name });
    expect(group).toHaveTextContent("Ana Sintética · Clase A · Sede A");
    expect(props.onChangeStatus).not.toHaveBeenCalled();
    fireEvent.click(within(group).getByRole("button", { name }));
    expect(props.onChangeStatus).toHaveBeenCalledExactlyOnceWith(enrollment, status);
  });
  it.each(["cancelled", "completed"] as const)("Volver de %s no cambia el estado", status => {
    const cancel = status === "cancelled";
    const props = setup({ bundle: withEnrollment(), ...(cancel ? { confirmingCancelId: enrollment.id } : { confirmingCompleteId: enrollment.id }) });
    fireEvent.click(screen.getByRole("button", { name: /^Volver sin/ }));
    expect(cancel ? props.onConfirmCancel : props.onConfirmComplete).toHaveBeenCalledExactlyOnceWith("");
    expect(props.onChangeStatus).not.toHaveBeenCalled();
  });
  it.each(["cancelled", "completed"] as const)("no simula cancelar una escritura %s ya en curso", status => {
    const cancel = status === "cancelled";
    const props = setup({ bundle: withEnrollment(), busyId: enrollment.id, ...(cancel ? { confirmingCancelId: enrollment.id } : { confirmingCompleteId: enrollment.id }) });
    const group = screen.getByRole("group");
    for (const button of within(group).getAllByRole("button")) { expect(button).toBeDisabled(); fireEvent.click(button); }
    expect(props.onConfirmCancel).not.toHaveBeenCalled();
    expect(props.onConfirmComplete).not.toHaveBeenCalled();
    expect(props.onChangeStatus).not.toHaveBeenCalled();
  });
  it("mantiene bloqueada la activación futura", () => {
    setup({ bundle: withEnrollment({ enrollments: [{ ...enrollment, status: "pending", startsOn: "2026-10-23" }] }) });
    expect(screen.queryByRole("button", { name: /^Activar/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Podrás activarla ese día/)).toBeVisible();
  });
  it("no añade acciones a inscripciones de prueba", () => {
    setup({ bundle: withEnrollment({ enrollments: [{ ...enrollment, status: "trial" }] }) });
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText(/esta pantalla no modifica el seguimiento de la prueba/)).toBeVisible();
  });
  it("lleva el foco a confirmar la baja y lo devuelve a su activador", () => {
    setupInteractiveConfirmation();
    const trigger = screen.getByRole("button", { name: "Dar de baja inscripción de Ana Sintética · Clase A · Sede A" });
    trigger.focus();
    fireEvent.click(trigger);

    const confirm = screen.getByRole("button", { name: "Confirmar baja de Ana Sintética · Clase A · Sede A" });
    expect(document.activeElement).toBe(confirm);
    fireEvent.click(screen.getByRole("button", { name: "Volver sin dar de baja a Ana Sintética · Clase A · Sede A" }));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Dar de baja inscripción de Ana Sintética · Clase A · Sede A" }));
  });
  it("lleva el foco a confirmar la finalización y lo devuelve a su activador", () => {
    setupInteractiveConfirmation();
    const trigger = screen.getByRole("button", { name: "Finalizar inscripción de Ana Sintética · Clase A · Sede A" });
    trigger.focus();
    fireEvent.click(trigger);

    const confirm = screen.getByRole("button", { name: "Confirmar finalización de Ana Sintética · Clase A · Sede A" });
    expect(document.activeElement).toBe(confirm);
    fireEvent.click(screen.getByRole("button", { name: "Volver sin finalizar la inscripción de Ana Sintética · Clase A · Sede A" }));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Finalizar inscripción de Ana Sintética · Clase A · Sede A" }));
  });
});
