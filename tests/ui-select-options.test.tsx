/**
 * @vitest-environment jsdom
 *
 * Regression ZAL-494 (PV-1) + PV-11.
 *
 * The custom <Select> wrapper used to render <SelectTrigger> as a <div> and
 * <SelectContent> as another <div>, so the <option> children ended up nested
 * inside divs. HTMLSelectElement.options only collects <option>/<optgroup>
 * direct children of the <select>, which made every Select render with
 * `select.options.length === 0` and broke the provider MarketplaceForm
 * (Categoría *) and AnnouncementForm (Prioridad/Categoría) dropdowns.
 *
 * The same wrapper also accepted id on <SelectTrigger>, leaving the actual
 * <select> without id and orphaning <Label htmlFor="..."> (WCAG 1.3.1,
 * 4.1.2). The fix moves id/className off the (now invisible) wrapper and
 * onto the underlying <select>.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

describe("Select — ZAL-494 PV-1", () => {
  it("<option>s end up as direct children of the underlying <select>", () => {
    const { container } = render(
      <Select value="" onValueChange={() => undefined}>
        <SelectTrigger>
          <SelectValue placeholder="Selecciona categoría" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="equipment">Equipamiento</SelectItem>
          <SelectItem value="clothing">Ropa</SelectItem>
        </SelectContent>
      </Select>
    );

    const select = container.querySelector("select");
    expect(select).not.toBeNull();
    // The bug surfaced as options.length === 0 because the <option>s were
    // nested in a <div> wrapper. After the fix they are direct children.
    expect(select!.options.length).toBe(2);
    expect(select!.options[0]?.value).toBe("equipment");
    expect(select!.options[1]?.value).toBe("clothing");
  });

  it("exposes a long option list (MarketplaceForm-like categories)", () => {
    const CATEGORIES = [
      { value: "equipment", label: "Equipamiento" },
      { value: "clothing", label: "Ropa" },
      { value: "supplements", label: "Suplementos" },
      { value: "books", label: "Libros" },
      { value: "particular_training", label: "Clases particulares" },
      { value: "personal_training", label: "Entrenamiento personal" },
      { value: "clinics", label: "Clínicas" },
      { value: "arbitration", label: "Arbitraje" },
      { value: "physiotherapy", label: "Fisioterapia" },
      { value: "photography", label: "Fotografía" },
      { value: "other", label: "Otro" },
    ];

    const { container } = render(
      <Select value="" onValueChange={() => undefined}>
        <SelectTrigger>
          <SelectValue placeholder="Selecciona categoría" />
        </SelectTrigger>
        <SelectContent>
          {CATEGORIES.map((cat) => (
            <SelectItem key={cat.value} value={cat.value}>
              {cat.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );

    expect(container.querySelector("select")!.options.length).toBe(CATEGORIES.length);
  });

  it("a keyboard user can pick an option", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();

    render(
      <Select value="" onValueChange={onValueChange}>
        <SelectTrigger>
          <SelectValue placeholder="Selecciona categoría" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="equipment">Equipamiento</SelectItem>
          <SelectItem value="clothing">Ropa</SelectItem>
        </SelectContent>
      </Select>
    );

    const select = screen.getByRole("combobox") as HTMLSelectElement;
    select.focus();
    // Selecting via the value setter triggers React's onChange just like a
    // real keyboard-driven option pick would.
    await user.selectOptions(select, "clothing");

    expect(onValueChange).toHaveBeenCalledWith("clothing");
  });
});

describe("Select — ZAL-494 PV-11 (id lands on the <select>)", () => {
  it("passes id from <Select> straight through to the <select>", () => {
    const { container } = render(
      <Select id="priority" value="" onValueChange={() => undefined}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="low">Baja</SelectItem>
          <SelectItem value="normal">Normal</SelectItem>
        </SelectContent>
      </Select>
    );

    expect(container.querySelector("select")!.id).toBe("priority");
  });

  it("forwards id from <SelectTrigger> to the <select> for backward compat", () => {
    // Existing callers (AnnouncementForm, AttendanceReport, ProgressReport,
    // DocumentUploadModal) used to put id on <SelectTrigger>. After the fix
    // we hoist that id onto the underlying <select> so the change is
    // transparent — but the canonical call site is now <Select id="...">.
    const { container } = render(
      <Select value="" onValueChange={() => undefined}>
        <SelectTrigger id="legacy-priority">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="low">Baja</SelectItem>
        </SelectContent>
      </Select>
    );

    expect(container.querySelector("select")!.id).toBe("legacy-priority");
  });

  it("<Label htmlFor> associates with the <select> via its id", () => {
    render(
      <div>
        <Label htmlFor="category">Categoría</Label>
        <Select id="category" value="" onValueChange={() => undefined}>
          <SelectTrigger>
            <SelectValue placeholder="Selecciona categoría" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="equipment">Equipamiento</SelectItem>
          </SelectContent>
        </Select>
      </div>
    );

    // getByLabelText only resolves when the label's `for`/nesting actually
    // targets the form control. With the old wrapper (id on a <div>) this
    // would throw; with the fix it returns the <select>.
    const select = screen.getByLabelText("Categoría") as HTMLSelectElement;
    expect(select.tagName).toBe("SELECT");
    expect(select.id).toBe("category");
  });
});