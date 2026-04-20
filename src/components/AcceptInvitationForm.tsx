"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormField, validators } from "@/components/ui/form-field";
import { useToast } from "@/components/ui/toast-provider";

interface AcceptInvitationFormProps {
  token: string;
  email: string;
  role: string;
  isAuthenticated: boolean;
  isSameEmail: boolean;
  userEmail: string | null;
}

export default function AcceptInvitationForm({
  token,
  email,
  role,
  isAuthenticated,
  isSameEmail,
  userEmail,
}: AcceptInvitationFormProps) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [completed, setCompleted] = useState(false);

  // Usuario autenticado con el mismo email → solo botón de aceptar
  if (isAuthenticated && isSameEmail) {
    if (completed) {
      return (
        <div className="space-y-3 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-semibold text-green-700">Invitación aceptada</h2>
          <p className="text-sm text-muted-foreground">
            Bienvenido/a. Serás redirigido/a a tu dashboard en unos segundos.
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div className="rounded-lg bg-green-50 border border-green-200 p-4 space-y-2">
          <p className="font-medium text-green-800">¡Hola! Estás a un paso de unirte.</p>
          <p className="text-sm text-green-700">
            Te están invitando como <strong>{role}</strong> usando tu cuenta de <strong>{email}</strong>.
          </p>
        </div>

        <Button onClick={handleAcceptExisting} className="w-full" disabled={pending}>
          {pending ? "Procesando..." : "Aceptar invitación"}
        </Button>
      </div>
    );
  }

  // Usuario autenticado con email diferente
  if (isAuthenticated && !isSameEmail) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 space-y-2">
          <p className="font-medium text-amber-800">Estás usando una cuenta diferente</p>
          <p className="text-sm text-amber-700">
            La invitación es para <strong>{email}</strong>, pero estás logueado como{" "}
            <strong>{userEmail}</strong>.
          </p>
        </div>

        <div className="space-y-3">
          <Button variant="outline" className="w-full" onClick={() => router.push("/auth/login")}>
            Cerrar sesión y usar otra cuenta
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => router.push("/dashboard")}>
            Ir a mi dashboard actual
          </Button>
        </div>
      </div>
    );
  }

  // Usuario no autenticado → formulario de registro completo
  if (completed) {
    return (
      <div className="space-y-3 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
          <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-2xl font-semibold text-green-700">¡Cuenta creada!</h2>
        <p className="text-sm text-muted-foreground">
          Tu cuenta ha sido creada y la invitación aceptada. Serás redirigido al inicio de sesión.
        </p>
      </div>
    );
  }

  async function handleAcceptExisting() {
    setPending(true);
    try {
      const response = await fetch("/api/invitations/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error ?? "No se pudo completar la invitación.");
      }

      toast.pushToast({
        title: "Invitación aceptada",
        description: "Redirigiendo a tu dashboard...",
        variant: "success",
      });

      setCompleted(true);
      setTimeout(() => {
        router.push("/dashboard");
      }, 2000);
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
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
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
      const supabase = createClient();

      // First, sign up with Supabase Auth
      const { error: signUpError } = await supabase.auth.signUp({
        email: email,
        password: password,
        options: {
          data: {
            full_name: name,
          },
        },
      });

      if (signUpError) {
        throw new Error(signUpError.message || "No se pudo crear la cuenta.");
      }

      // Then call the complete endpoint to accept invitation
      const response = await fetch("/api/invitations/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, name }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error ?? "No se pudo completar la invitación.");
      }

      toast.pushToast({
        title: "Cuenta creada",
        description: "Tu cuenta ha sido creada y la invitación aceptada. Redirigiendo...",
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
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-lg bg-blue-50 border border-blue-200 p-4">
        <p className="text-sm text-blue-700">
          <strong>Rol:</strong> {role} &nbsp;|&nbsp; <strong>Email:</strong> {email}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          id="name"
          label="Nombre completo"
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
        {pending ? "Creando cuenta..." : "Crear cuenta y aceptar invitación"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        ¿Ya tienes cuenta?{" "}
        <Link href="/auth/login" className="font-medium text-primary hover:underline">
          Inicia sesión
        </Link>
      </p>
    </form>
  );
}
