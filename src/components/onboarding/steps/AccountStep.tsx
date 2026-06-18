"use client";

import { FormEvent } from "react";

import { FormField, validators } from "@/components/ui/form-field";

interface AccountStepProps {
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
  loading: boolean;
  onFullNameChange: (value: string) => void;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onConfirmPasswordChange: (value: string) => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  hasAccount: boolean;
  onNext: () => void;
}

export function AccountStep({
  fullName,
  email,
  password,
  confirmPassword,
  loading,
  onFullNameChange,
  onEmailChange,
  onPasswordChange,
  onConfirmPasswordChange,
  onSubmit,
  hasAccount,
  onNext,
}: AccountStepProps) {
  if (hasAccount) {
    return (
      <div className="space-y-4 rounded-lg border border-border bg-muted/40 p-6 text-sm text-muted-foreground">
        <div className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Paso 1
          </span>
          <h2 className="text-lg font-semibold text-foreground">Cuenta</h2>
          <p className="text-sm text-muted-foreground">
            Crea tu cuenta para comenzar a usar Zaltyko
          </p>
        </div>
        <p>
          Ya encontramos una cuenta activa en esta sesión. Puedes continuar con los
          siguientes pasos o volver para actualizar la información cuando lo necesites.
        </p>
        <div className="flex flex-wrap gap-3 text-xs font-medium">
          <span className="rounded-md border border-border bg-background px-3 py-2">
            Usuario: {email || "Registrado"}
          </span>
          <span className="rounded-md border border-border bg-background px-3 py-2 text-zaltyko-primary">
            Paso completado
          </span>
        </div>
        <button
          type="button"
          onClick={onNext}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90"
        >
          Ir al siguiente paso
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="space-y-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Paso 1
        </span>
        <h2 className="text-xl font-semibold">Cuenta</h2>
        <p className="text-sm text-muted-foreground">
          Crea tu cuenta para comenzar a usar Zaltyko
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <FormField
          id="fullName"
          label="Nombre completo"
          type="text"
          value={fullName}
          onChange={(event) => onFullNameChange(event.target.value)}
          validator={validators.combine(
            validators.required("El nombre es obligatorio"),
            validators.minLength(2, "El nombre debe tener al menos 2 caracteres")
          )}
          validateOnChange={true}
          validateOnBlur={true}
          disabled={loading}
        />
        <FormField
          id="email"
          label="Correo electrónico"
          type="email"
          value={email || ""}
          onChange={(event) => onEmailChange(event.target.value)}
          validator={validators.combine(
            validators.required("El correo es obligatorio"),
            validators.email("Ingresa un correo válido")
          )}
          validateOnChange={true}
          validateOnBlur={true}
          disabled={loading}
        />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <FormField
          id="password"
          label="Contraseña"
          type="password"
          value={password}
          onChange={(event) => onPasswordChange(event.target.value)}
          validator={validators.combine(
            validators.required("La contraseña es obligatoria"),
            validators.minLength(6, "La contraseña debe tener al menos 6 caracteres")
          )}
          validateOnChange={true}
          validateOnBlur={true}
          disabled={loading}
        />
        <FormField
          id="confirmPassword"
          label="Confirmar contraseña"
          type="password"
          value={confirmPassword}
          onChange={(event) => onConfirmPasswordChange(event.target.value)}
          validator={(value) => {
            if (!value) return "Confirma tu contraseña";
            if (value !== password) return "Las contraseñas no coinciden";
            return null;
          }}
          validateOnChange={true}
          validateOnBlur={true}
          disabled={loading}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70"
          disabled={loading}
        >
          Crear cuenta y continuar
        </button>
      </div>
    </form>
  );
}

