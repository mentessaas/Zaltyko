// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { StrictMode, useState, type ComponentProps } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OwnerEnrollmentCreateForm } from "@/components/owner-dashboard/OwnerEnrollmentCreateForm";

type Props = ComponentProps<typeof OwnerEnrollmentCreateForm>;
const classItem = {
  id: "synthetic-class", name: "Clase de prueba", locationId: "synthetic-location",
  locationName: "Sede de prueba", programId: null, programName: null,
  programKind: null, capacity: 10, spaceCapacity: null, effectiveFrom: "2026-10-01", effectiveTo: null,
  occupied: 0, availableSeats: 10,
};
function props(overrides: Partial<Props> = {}): Props {
  return {
    organizationId: "10000000-0000-4000-8000-000000000001",
    locations: [{ id: "synthetic-location", name: "Sede de prueba", timezone: "Europe/Madrid" }],
    classes: [classItem], createLocationId: "synthetic-location", classTemplateId: "synthetic-class",
    classesForLocation: [classItem], selectedClass: classItem, participantLabel: "Gimnasta",
    candidates: [{ id: "synthetic-athlete", name: "Gimnasta sintética" }], selectedCandidate: null,
    candidateQuery: "si", candidateLoading: false, candidateError: "", candidateNotice: "",
    startsOn: "2026-10-22", pricePlans: [], pricePlansLoading: false, pricePlansError: "", pricePlanId: "",
    createToday: "2026-10-22", busyCreate: false, previewMode: false,
    onLocationChange: vi.fn(), onClassChange: vi.fn(), onCandidateQueryChange: vi.fn(),
    onCandidateSelect: vi.fn(), onCandidateClear: vi.fn(), onStartsOnChange: vi.fn(), onPricePlanChange: vi.fn(),
    onRetryCandidates: vi.fn(), onRetryPricePlans: vi.fn(),
    onSubmit: vi.fn(event => event.preventDefault()), ...overrides,
  };
}
afterEach(cleanup);

describe("inscripción: controles y estados accesibles sin llamadas externas", () => {
  it("asocia una tarifa desaparecida al selector y al envío sin bloquear su corrección ni mover foco", () => {
    const input = props({ selectedCandidate: { id: "synthetic-athlete", name: "Gimnasta sintética" }, pricePlanId: "missing-price", pricePlanUnavailable: true });
    const { rerender } = render(<OwnerEnrollmentCreateForm {...input} pricePlanUnavailable={false} />);
    const date = screen.getByLabelText("Fecha de inicio");
    date.focus();
    rerender(<OwnerEnrollmentCreateForm {...input} />);
    const select = screen.getByRole("combobox", { name: "Tarifa mensual" });
    expect(select).toBeEnabled();
    expect(select).toHaveAttribute("aria-invalid", "true");
    expect(select).toHaveAccessibleDescription(/La tarifa seleccionada ya no está disponible/);
    expect(screen.getByRole("button", { name: "Registrar inscripción pendiente" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Registrar inscripción pendiente" })).toHaveAccessibleDescription(/Elige otra o «Sin tarifa asignada»/);
    expect(date).toHaveFocus();
    rerender(<OwnerEnrollmentCreateForm {...input} pricePlanId="" pricePlanUnavailable={false} />);
    expect(select).not.toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Registrar inscripción pendiente" })).toBeEnabled();
    expect(input.onSubmit).not.toHaveBeenCalled();
  });
  it("asocia la ayuda y el error de búsqueda al campo con nombre", () => {
    render(<OwnerEnrollmentCreateForm {...props({ candidateError: "No se pudo consultar la búsqueda." })} />);
    const input = screen.getByRole("searchbox", { name: "Gimnasta" });
    expect(input).toHaveAccessibleDescription(/Solo aparecen personas vinculadas a esta sede.*No se pudo consultar la búsqueda/);
    expect(screen.getByRole("alert")).toHaveAttribute("id", "enrollment-search-error");
  });
  it("expone el periodo de la clase y marca una fecha de inscripción fuera de rango", () => {
    const futureClass = {
      ...classItem,
      effectiveFrom: "2026-11-01",
      effectiveTo: "2027-06-30",
    };
    render(
      <OwnerEnrollmentCreateForm
        {...props({
          classes: [futureClass],
          classesForLocation: [futureClass],
          selectedClass: futureClass,
          startsOn: "2026-10-22",
          selectedCandidate: {
            id: "synthetic-athlete",
            name: "Gimnasta sintética",
          },
        })}
      />
    );

    const date = screen.getByLabelText("Fecha de inicio");
    expect(date).toHaveAttribute("min", "2026-11-01");
    expect(date).toHaveAttribute("max", "2027-06-30");
    expect(date).toHaveAttribute("aria-invalid", "true");
    expect(date).toHaveAccessibleDescription(/La fecha debe estar dentro del periodo/);
    expect(screen.getByRole("button", { name: "Registrar inscripción pendiente" })).toBeDisabled();
  });
  it("expone la búsqueda en curso y el aviso de ausencia de resultados", () => {
    const { rerender } = render(<OwnerEnrollmentCreateForm {...props({ candidateLoading: true })} />);
    expect(screen.getByRole("searchbox")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Buscando…");
    rerender(<OwnerEnrollmentCreateForm {...props({ candidates: [], candidateNotice: "No hay coincidencias en esta sede." })} />);
    expect(screen.getByRole("searchbox")).toHaveAttribute("aria-busy", "false");
    expect(screen.getByRole("status")).toHaveTextContent("No hay coincidencias en esta sede.");
  });
  it("mantiene nombre del grupo seleccionado y una acción de cambio inequívoca", () => {
    const input = props({ selectedCandidate: { id: "synthetic-athlete", name: "Gimnasta sintética" } });
    render(<OwnerEnrollmentCreateForm {...input} />);
    expect(screen.getByRole("group", { name: "Gimnasta" })).toHaveTextContent("Gimnasta sintética");
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cambiar gimnasta: Gimnasta sintética" }));
    expect(input.onCandidateClear).toHaveBeenCalledOnce();
    expect(input.onSubmit).not.toHaveBeenCalled();
  });
  it("conserva el recorrido de teclado al seleccionar un gimnasta", () => {
    const input = props();
    const { rerender } = render(<OwnerEnrollmentCreateForm {...input} />);
    const result = screen.getByRole("button", { name: "Gimnasta sintética" });
    result.focus();
    fireEvent.click(result);
    rerender(<OwnerEnrollmentCreateForm {...input} selectedCandidate={input.candidates[0]} />);
    expect(screen.getByRole("button", { name: "Cambiar gimnasta: Gimnasta sintética" })).toHaveFocus();
    expect(input.onCandidateSelect).toHaveBeenCalledOnce();
    expect(input.onSubmit).not.toHaveBeenCalled();
  });
  it("devuelve el foco al buscador al cambiar el gimnasta seleccionado", () => {
    const input = props({ selectedCandidate: { id: "synthetic-athlete", name: "Gimnasta sintética" } });
    const { rerender } = render(<OwnerEnrollmentCreateForm {...input} />);
    const change = screen.getByRole("button", { name: "Cambiar gimnasta: Gimnasta sintética" });
    change.focus();
    fireEvent.click(change);
    rerender(<OwnerEnrollmentCreateForm {...input} selectedCandidate={null} />);
    expect(screen.getByRole("searchbox", { name: "Gimnasta" })).toHaveFocus();
    expect(input.onCandidateClear).toHaveBeenCalledOnce();
    expect(input.onSubmit).not.toHaveBeenCalled();
  });
  it.each(["select", "clear"] as const)("no roba el foco si la persona ya pasó a otro campo: %s", action => {
    const input = props({ selectedCandidate: action === "clear" ? { id: "synthetic-athlete", name: "Gimnasta sintética" } : null });
    const { rerender } = render(<OwnerEnrollmentCreateForm {...input} />);
    const trigger = screen.getByRole("button", { name: action === "clear" ? "Cambiar gimnasta: Gimnasta sintética" : "Gimnasta sintética" });
    trigger.focus();
    fireEvent.click(trigger);
    const date = screen.getByLabelText("Fecha de inicio");
    date.focus();
    rerender(<OwnerEnrollmentCreateForm {...input} selectedCandidate={action === "clear" ? null : input.candidates[0]} />);
    expect(date).toHaveFocus();
    expect(input.onSubmit).not.toHaveBeenCalled();
  });
  it.each([
    { organizationId: "20000000-0000-4000-8000-000000000002" },
    { createLocationId: "another-location" },
    { classTemplateId: "another-class" },
    { busyCreate: true },
    { previewMode: true },
  ])("descarta una petición de foco al cambiar contexto o bloquear el formulario: %s", change => {
    const input = props();
    const { rerender } = render(<OwnerEnrollmentCreateForm {...input} />);
    const trigger = screen.getByRole("button", { name: "Gimnasta sintética" });
    trigger.focus();
    fireEvent.click(trigger);
    rerender(<OwnerEnrollmentCreateForm {...input} {...change} selectedCandidate={input.candidates[0]} />);
    expect(screen.getByRole("button", { name: "Cambiar gimnasta: Gimnasta sintética" })).not.toHaveFocus();
    rerender(<OwnerEnrollmentCreateForm {...input} selectedCandidate={input.candidates[0]} />);
    expect(screen.getByRole("button", { name: "Cambiar gimnasta: Gimnasta sintética" })).not.toHaveFocus();
  });
  it("no mueve el foco por cambios externos de selección ni al montar en StrictMode", () => {
    const input = props();
    const { rerender } = render(<StrictMode><OwnerEnrollmentCreateForm {...input} /></StrictMode>);
    const date = screen.getByLabelText("Fecha de inicio");
    date.focus();
    rerender(<StrictMode><OwnerEnrollmentCreateForm {...input} selectedCandidate={input.candidates[0]} /></StrictMode>);
    expect(date).toHaveFocus();
    rerender(<StrictMode><OwnerEnrollmentCreateForm {...input} selectedCandidate={null} /></StrictMode>);
    expect(date).toHaveFocus();
  });
  it("no impone foco si el botón no lo tenía al activarse", () => {
    const input = props();
    const { rerender } = render(<OwnerEnrollmentCreateForm {...input} />);
    fireEvent.click(screen.getByRole("button", { name: "Gimnasta sintética" }));
    rerender(<OwnerEnrollmentCreateForm {...input} selectedCandidate={input.candidates[0]} />);
    expect(screen.getByRole("button", { name: "Cambiar gimnasta: Gimnasta sintética" })).not.toHaveFocus();
    expect(input.onCandidateSelect).toHaveBeenCalledOnce();
  });
  it("no sigue una selección distinta de la que activó la persona", () => {
    const input = props();
    const { rerender } = render(<OwnerEnrollmentCreateForm {...input} />);
    const trigger = screen.getByRole("button", { name: "Gimnasta sintética" });
    trigger.focus();
    fireEvent.click(trigger);
    rerender(<OwnerEnrollmentCreateForm {...input} selectedCandidate={{ id: "other-athlete", name: "Otra gimnasta" }} />);
    expect(screen.getByRole("button", { name: "Cambiar gimnasta: Otra gimnasta" })).not.toHaveFocus();
    rerender(<OwnerEnrollmentCreateForm {...input} selectedCandidate={input.candidates[0]} />);
    expect(screen.getByRole("button", { name: "Cambiar gimnasta: Gimnasta sintética" })).not.toHaveFocus();
  });
  it("no conserva peticiones de foco entre desmontaje y montaje", () => {
    const input = props();
    const { unmount } = render(<OwnerEnrollmentCreateForm {...input} />);
    const trigger = screen.getByRole("button", { name: "Gimnasta sintética" });
    trigger.focus();
    fireEvent.click(trigger);
    unmount();
    render(<OwnerEnrollmentCreateForm {...input} selectedCandidate={input.candidates[0]} />);
    expect(screen.getByRole("button", { name: "Cambiar gimnasta: Gimnasta sintética" })).not.toHaveFocus();
  });
  it("sigue la selección controlada por el padre en StrictMode sin enviar el formulario", () => {
    const input = props();
    function ControlledForm() {
      const [selected, setSelected] = useState<Props["selectedCandidate"]>(null);
      return <OwnerEnrollmentCreateForm {...input} selectedCandidate={selected} onCandidateSelect={setSelected} onCandidateClear={() => setSelected(null)} />;
    }
    render(<StrictMode><ControlledForm /></StrictMode>);
    const result = screen.getByRole("button", { name: "Gimnasta sintética" });
    result.focus();
    fireEvent.click(result);
    const change = screen.getByRole("button", { name: "Cambiar gimnasta: Gimnasta sintética" });
    expect(change).toHaveFocus();
    fireEvent.click(change);
    expect(screen.getByRole("searchbox", { name: "Gimnasta" })).toHaveFocus();
    expect(input.onSubmit).not.toHaveBeenCalled();
  });
  it.each([{ busyCreate: true }, { previewMode: true }])("no permite cambiar la selección durante guardado o ejemplo: %s", mode => {
    const input = props({ ...mode, selectedCandidate: { id: "synthetic-athlete", name: "Gimnasta sintética" } });
    render(<OwnerEnrollmentCreateForm {...input} />);
    const change = screen.getByRole("button", { name: "Cambiar gimnasta: Gimnasta sintética" });
    expect(change).toBeDisabled();
    fireEvent.click(change);
    expect(input.onCandidateClear).not.toHaveBeenCalled();
  });
  it("en modo de ejemplo no habilita la búsqueda ni la selección de resultados", () => {
    const input = props({ previewMode: true });
    render(<OwnerEnrollmentCreateForm {...input} />);
    expect(screen.getByRole("searchbox")).toBeDisabled();
    const candidate = screen.getByRole("button", { name: "Gimnasta sintética" });
    expect(candidate).toBeDisabled();
    fireEvent.click(candidate);
    expect(input.onCandidateSelect).not.toHaveBeenCalled();
    expect(input.onSubmit).not.toHaveBeenCalled();
  });
  it("seleccionar un resultado llama solo al callback y no registra una inscripción", () => {
    const input = props();
    render(<OwnerEnrollmentCreateForm {...input} />);
    fireEvent.click(screen.getByRole("button", { name: "Gimnasta sintética" }));
    expect(input.onCandidateSelect).toHaveBeenCalledWith(input.candidates[0]);
    expect(input.onSubmit).not.toHaveBeenCalled();
  });
  it("asocia el error de tarifas sin convertirlo en una tarifa cero", () => {
    render(<OwnerEnrollmentCreateForm {...props({ pricePlansError: "No se pudieron consultar las tarifas." })} />);
    expect(screen.getByRole("combobox", { name: "Tarifa mensual" })).toHaveAccessibleDescription(/No se pudieron consultar las tarifas/);
    expect(screen.getByRole("option", { name: "Sin tarifa asignada" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveAttribute("id", "enrollment-price-plan-error");
  });
  it.each([{ pricePlansLoading: true }, { pricePlansError: "No se pudieron consultar las tarifas." }])("explica por qué el alta espera a la consulta de tarifas: %s", state => {
    const input = props({ ...state, selectedCandidate: { id: "synthetic-athlete", name: "Gimnasta sintética" } });
    render(<OwnerEnrollmentCreateForm {...input} />);
    const submit = screen.getByRole("button", { name: "Registrar inscripción pendiente" });
    expect(submit).toBeDisabled();
    expect(submit).toHaveAccessibleDescription(/primero debe completarse la consulta de tarifas.*elegir una tarifa o dejarla sin asignar/);
    fireEvent.click(submit);
    expect(input.onSubmit).not.toHaveBeenCalled();
  });
  it("conserva el límite de plazas y no habilita registro en una clase completa", () => {
    render(<OwnerEnrollmentCreateForm {...props({ selectedClass: { ...classItem, availableSeats: 0 }, selectedCandidate: { id: "synthetic-athlete", name: "Gimnasta sintética" } })} />);
    expect(screen.getByRole("button", { name: "Registrar inscripción pendiente" })).toBeDisabled();
  });
  it("los botones de reconsulta llaman solo a sus callbacks de lectura", () => {
    const input = props({ candidateError: "Búsqueda fallida", pricePlansError: "Tarifas no disponibles" });
    render(<OwnerEnrollmentCreateForm {...input} />);
    fireEvent.click(screen.getByRole("button", { name: "Volver a buscar" }));
    fireEvent.click(screen.getByRole("button", { name: "Volver a consultar las tarifas" }));
    expect(input.onRetryCandidates).toHaveBeenCalledOnce();
    expect(input.onRetryPricePlans).toHaveBeenCalledOnce();
    expect(input.onSubmit).not.toHaveBeenCalled();
  });
  it.each([{ busyCreate: true }, { previewMode: true }])("no reconsulta al guardar o en ejemplo: %s", mode => {
    const input = props({ ...mode, candidateError: "Búsqueda fallida", pricePlansError: "Tarifas no disponibles" });
    render(<OwnerEnrollmentCreateForm {...input} />);
    const candidates = screen.getByRole("button", { name: "Volver a buscar" });
    const prices = screen.getByRole("button", { name: "Volver a consultar las tarifas" });
    expect(candidates).toBeDisabled(); expect(prices).toBeDisabled();
    fireEvent.click(candidates); fireEvent.click(prices);
    expect(input.onRetryCandidates).not.toHaveBeenCalled();
    expect(input.onRetryPricePlans).not.toHaveBeenCalled();
  });
});
