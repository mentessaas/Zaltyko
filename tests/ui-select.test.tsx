/** @vitest-environment jsdom */
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

describe("native Select", () => {
  it("preserves labels when items use badges, icons, or layout wrappers", () => {
    render(
      <Select value="template" aria-label="Plantilla">
        <SelectTrigger><SelectValue placeholder="Selecciona" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="template">
            <div><span>Recordatorio</span><strong> · mensual</strong></div>
          </SelectItem>
        </SelectContent>
      </Select>
    );

    expect(screen.getByRole("option")).toHaveTextContent("Recordatorio · mensual");
    expect(screen.getByRole("option").querySelector("div")).toBeNull();
  });
});
