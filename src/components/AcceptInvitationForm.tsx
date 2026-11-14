"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, ShieldAlert, UserPlus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormField, validators } from "@/components/ui/form-field";
import { useToast } from "@/components/ui/toast-provider";
import { logger } from "@/lib/logger";
import { checkPwnedPassword, PWNED_PASSWORD_MESSAGE } from "@/lib/security/pwned-password";

interface AcceptInvitationFormProps {
  token: string;
  email: string;
  role: string;
  isAuthenticated: boolean;
  isSameEmail: boolean;
  userEmail: string | null;
}

function getRoleLabel(role: string) {
  const labels: Record<string, string> = {
    owner: "Propietario",
    admin: "Administrador",
    coach: "Entrenador",
    athlete: "Atleta",
    parent: "Tutor",
  };

  return labels[role] ?? role;
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
        <div role="status" className="space-y-3 rounded-[10px] border border-mat/30 bg-mat-wash p-5">
          <CheckCircle2 aria-hidden className="h-6 w-6 text-mat" />
          <h2 className="font-display text-2xl font-black uppercase leading-none text-mat-night">Invitación aceptada</h2>
          <p className="text-sm leading-6 text-ramp-600">
            Te damos la bienvenida. En unos segundos te llevamos a tu panel.
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div className="rounded-[10px] border border-mat/20 bg-mat-wash p-4">
          <div className="flex items-start gap-3">
            <UserPlus aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-mat" />
            <div className="space-y-1.5">
              <p className="font-semibold text-mat-night">Ya estás dentro con la cuenta correcta</p>
              <p className="text-sm text-ramp-600">
                Te están invitando como <strong>{getRoleLabel(role)}</strong> usando <strong>{email}</strong>.
              </p>
            </div>
          </div>
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
        {/* Aviso, no error: polvo de magnesio en lugar del ámbar heredado, que se pintaba en coral. */}
        <div className="rounded-[10px] border border-chalk-line bg-chalk-dust p-4">
          <div className="flex items-start gap-3">
            <ShieldAlert aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-mat-deep" />
            <div className="space-y-1.5">
              <p className="font-semibold text-mat-night">Estás usando una cuenta diferente</p>
              <p className="text-sm text-ramp-600">
                La invitación es para <strong>{email}</strong>, pero ahora mismo estás dentro como{" "}
                <strong>{userEmail}</strong>.
              </p>
            </div>
          </div>
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
      <div role="status" className="space-y-3 rounded-[10px] border border-mat/30 bg-mat-wash p-5">
        <CheckCircle2 aria-hidden className="h-6 w-6 text-mat" />
        <h2 className="font-display text-2xl font-black uppercase leading-none text-mat-night">Cuenta creada</h2>
        <p className="text-sm leading-6 text-ramp-600">
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

      const payload = await response.json().catch(() => ({}));
      const redirectUrl = payload?.data?.redirectUrl ?? payload?.redirectUrl ?? "/dashboard";

      toast.pushToast({
        title: "Invitación aceptada",
        description: "Te llevamos a tu panel...",
        variant: "success",
      });

      setCompleted(true);
      setTimeout(() => {
        router.push(redirectUrl);
      }, 2000);
    } catch (error) {
      logger.error("Error", error);
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

    // Verificar que la contraseña no aparezca en filtraciones públicas (HIBP,
    // k-anonymity). Falla en abierto si la API no responde.
    try {
      const pwned = await checkPwnedPassword(password);
      if (pwned.pwned) {
        toast.pushToast({
          title: "Contraseña comprometida",
          description: PWNED_PASSWORD_MESSAGE,
          variant: "error",
        });
        return;
      }
    } catch {
      // Never block the invitation signup on the breach check (helper is
      // fail-open, this catch is belt-and-suspenders).
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

      const payload = await response.json().catch(() => ({}));
      const redirectUrl = payload?.data?.redirectUrl ?? payload?.redirectUrl ?? "/dashboard";

      toast.pushToast({
        title: "Cuenta creada",
        description: "Tu cuenta ha sido creada y la invitación aceptada. Redirigiendo...",
        variant: "success",
      });

      setCompleted(true);
      setTimeout(() => {
        router.push(redirectUrl);
      }, 2500);
    } catch (error) {
      logger.error("Error", error);
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
      <div className="rounded-[10px] border border-chalk-line bg-white p-4">
        <p className="text-sm text-mat-night">
          <strong>Rol:</strong> {getRoleLabel(role)} &nbsp;|&nbsp; <strong>Email:</strong> {email}
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
          <Label>Rol asignado</Label>
          <Input value={getRoleLabel(role)} disabled />
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

      <p className="text-sm text-ramp-600">
        ¿Ya tienes cuenta?{" "}
        <Link href="/auth/login" className="font-semibold text-mat underline decoration-2 underline-offset-[6px] hover:decoration-[3px]">
          Inicia sesión
        </Link>
      </p>
    </form>
  );
}
