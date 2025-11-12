"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormField, validators } from "@/components/ui/form-field";
import { useToast } from "@/components/ui/toast-provider";

interface AcceptInvitationFormProps {
  token: string;
  email: string;
  role: string;
}

export default function AcceptInvitationForm({ token, email, role }: AcceptInvitationFormProps) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [completed, setCompleted] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (password !== confirmPassword) {
      toast.pushToast({
        title: "Error de validación",
        description: "Las contraseñas no coinciden.",
        variant: "error",
      });
      return;
    }

    setPending(true);

    try {
      const response = await fetch("/api/invitations/complete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token,
          password,
          name,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error ?? "No se pudo completar la invitación.");
      }

      toast.pushToast({
        title: "Cuenta creada",
        description: "Tu cuenta ha sido creada exitosamente.",
        variant: "success",
      });

      setCompleted(true);
      setTimeout(() => {
        router.push("/auth/login");
      }, 2500);
    } catch (error) {
      console.error(error);
      toast.pushToast({
        title: "Error",
        description: error instanceof Error ? error.message : "Error inesperado.",
        variant: "error",
      });
    } finally {
      setPending(false);
    }
  };

  if (completed) {
    return (
      <div className="space-y-3 text-center">
        <h2 className="text-2xl font-semibold text-zaltyko-primary">Invitación aceptada</h2>
        <p className="text-sm text-muted-foreground">
          Tu cuenta ha sido creada. Serás redirigido al inicio de sesión en unos segundos.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">Correo</Label>
        <Input value={email} disabled />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          id="name"
          label="Nombre"
          type="text"
          placeholder="Tu nombre completo"
          value={name}
          onChange={(event) => setName(event.target.value)}
          validator={validators.combine(
            validators.required("El nombre es obligatorio"),
            validators.minLength(2, "El nombre debe tener al menos 2 caracteres")
          )}
          validateOnChange={true}
          validateOnBlur={true}
          disabled={pending}
        />
        <div className="space-y-1">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Rol asignado</Label>
          <Input value={role} disabled />
        </div>
      </div>

      <FormField
        id="password"
        label="Contraseña"
        type="password"
        placeholder="Mínimo 8 caracteres"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        validator={validators.combine(
          validators.required("La contraseña es obligatoria"),
          validators.minLength(8, "La contraseña debe tener al menos 8 caracteres")
        )}
        validateOnChange={true}
        validateOnBlur={true}
        disabled={pending}
      />

      <FormField
        id="confirmPassword"
        label="Confirmar contraseña"
        type="password"
        placeholder="Confirma tu contraseña"
        value={confirmPassword}
        onChange={(event) => setConfirmPassword(event.target.value)}
        validator={(value) => {
          if (!value) return "Confirma tu contraseña";
          if (value !== password) return "Las contraseñas no coinciden";
          return null;
        }}
        validateOnChange={true}
        validateOnBlur={true}
        disabled={pending}
      />

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Creando cuenta..." : "Aceptar invitación"}
      </Button>
    </form>
  );
}


