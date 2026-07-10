/**
 * @vitest-environment jsdom
 *
 * Tests reales de componentes UI criticos.
 * Reemplaza los placeholders previos (expect(true).toBe(true)) con tests
 * de comportamiento real usando React Testing Library.
 *
 * Componentes cubiertos: FormField, ConfirmDialog.
 * Componentes grandes (AthletesTableView, EditAthleteDialog) requieren
 * setup mas complejo (Drizzle + Supabase + i18n) que se cubre en tests
 * de integracion separados.
 */
import { describe, it, expect, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

import { FormField, validators } from "@/components/ui/form-field";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

// Radix Dialog necesita un portal; en test environment ya esta disponible
// via jsdom. Sin mocks adicionales.

describe("FormField", () => {
  it("renderiza label asociado al input por id", () => {
    render(<FormField id="email" label="Correo electronico" />);
    const input = screen.getByLabelText("Correo electronico");
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute("id", "email");
  });

  it("muestra error externo cuando se pasa como prop", () => {
    render(
      <FormField
        id="email"
        label="Correo"
        error="Correo invalido"
        defaultValue="bad"
      />
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Correo invalido");
    expect(screen.getByLabelText("Correo")).toHaveAttribute("aria-invalid", "true");
  });

  it("valida required en blur", async () => {
    const user = userEvent.setup();
    render(
      <FormField
        id="name"
        label="Nombre"
        validator={validators.required()}
        defaultValue=""
      />
    );
    const input = screen.getByLabelText("Nombre");
    await user.click(input);
    await user.tab();
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Este campo es obligatorio"
      );
    });
    expect(input).toHaveAttribute("aria-invalid", "true");
  });

  it("valida email y muestra error solo despues de touch", async () => {
    const user = userEvent.setup();
    render(
      <FormField
        id="email"
        label="Email"
        validator={validators.email()}
        defaultValue=""
      />
    );
    const input = screen.getByLabelText("Email");
    // Sin touch: no error
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await user.type(input, "no-es-email");
    await user.tab();
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Correo electrónico inválido"
      );
    });
  });

  it("minLength funciona correctamente", async () => {
    const user = userEvent.setup();
    render(
      <FormField
        id="password"
        label="Password"
        validator={validators.minLength(8)}
        defaultValue=""
      />
    );
    const input = screen.getByLabelText("Password");
    await user.type(input, "abc");
    await user.tab();
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Debe tener al menos 8 caracteres"
      );
    });
  });
});

describe("ConfirmDialog", () => {
  it("renderiza titulo, descripcion y botones", () => {
    render(
      <ConfirmDialog
        open
        title="Eliminar atleta"
        description="Esta accion no se puede deshacer."
        confirmText="Eliminar"
        onConfirm={vi.fn()}
      />
    );
    expect(screen.getByText("Eliminar atleta")).toBeInTheDocument();
    expect(screen.getByText("Esta accion no se puede deshacer.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Eliminar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeInTheDocument();
  });

  it("llama onConfirm al pulsar confirmar", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open
        title="Confirmar"
        description="?"
        onConfirm={onConfirm}
      />
    );
    await user.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("llama onCancel al pulsar cancelar", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open
        title="Confirmar"
        description="?"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />
    );
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("muestra variant destructive con estilo destructivo", () => {
    render(
      <ConfirmDialog
        open
        title="Eliminar"
        description="?"
        variant="destructive"
        onConfirm={vi.fn()}
      />
    );
    // En variant destructive el boton confirmar usa bg-zaltyko-coral.
    const confirmButton = screen.getByRole("button", { name: "Confirmar" });
    expect(confirmButton.className).toContain("bg-zaltyko-coral");
  });

  it("muestra estado 'Procesando...' mientras la promesa esta pending", async () => {
    const user = userEvent.setup();
    let resolveConfirm: () => void = () => undefined;
    const onConfirm = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveConfirm = resolve;
        })
    );
    render(
      <ConfirmDialog
        open
        title="Cargar"
        description="?"
        confirmText="Cargar"
        onConfirm={onConfirm}
      />
    );
    await user.click(screen.getByRole("button", { name: "Cargar" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Procesando..." })).toBeDisabled();
    });
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();
    await act(async () => {
      resolveConfirm();
    });
  });
});
