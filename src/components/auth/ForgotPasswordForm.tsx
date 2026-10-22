"use client";

import Link from "next/link";
import { useState } from "react";
import { AuthPageShell } from "@/components/auth/AuthPageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { isValidEmail, normalizeEmail } from "@/lib/validation/email-utils";

export function ForgotPasswordForm({
  nextPath,
  linkExpired = false,
}: {
  nextPath: string;
  linkExpired?: boolean;
}) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  let supabase: ReturnType<typeof createClient> | null = null;
  try {
    supabase = createClient();
  } catch {
    supabase = null;
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail || !isValidEmail(normalizedEmail)) {
      setError("Escribe una dirección de correo válida.");
      return;
    }
    if (!supabase) {
      setError(
        "El servicio de acceso no está disponible. Inténtalo más tarde."
      );
      return;
    }

    setBusy(true);
    try {
      const resetPath = `/reset-password?next=${encodeURIComponent(nextPath)}`;
      const callback = new URL("/auth/callback", window.location.origin);
      callback.searchParams.set("next", resetPath);
      const { error: requestError } = await supabase.auth.resetPasswordForEmail(
        normalizedEmail,
        { redirectTo: callback.toString() }
      );
      if (requestError) {
        setError(
          "No pudimos enviar el enlace. Revisa el correo e inténtalo de nuevo más tarde."
        );
      } else {
        // Keep the same response for known and unknown addresses to prevent account enumeration.
        setMessage(
          "Si existe una cuenta con ese correo, recibirá un enlace para crear una contraseña nueva. Revisa también el correo no deseado."
        );
      }
    } catch {
      setError("No pudimos enviar el enlace. Inténtalo de nuevo más tarde.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthPageShell
      title="Recuperar contraseña"
      description="Te enviaremos un enlace para crear una contraseña nueva."
      footer={
        <Link
          href={`/auth/login?next=${encodeURIComponent(nextPath)}`}
          className="font-semibold text-zaltyko-indigo hover:underline"
        >
          Volver a iniciar sesión
        </Link>
      }
      sideTitle="Vuelve a tu espacio"
      sideDescription="Usa el correo asociado a tu cuenta para recibir un enlace seguro de recuperación."
      highlights={[
        "El enlace caduca por seguridad.",
        "No compartiremos si el correo tiene una cuenta.",
        "El cambio solo se aplica después de confirmar el enlace.",
      ]}
    >
      {linkExpired && (
        <p
          role="alert"
          className="mb-4 rounded-lg border border-amber-500/40 bg-amber-50 p-3 text-sm text-amber-900"
        >
          El enlace de recuperación caducó o ya se utilizó. Solicita uno nuevo.
        </p>
      )}
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="recovery-email">Correo electrónico</Label>
          <Input
            id="recovery-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        {message && (
          <p
            role="status"
            aria-live="polite"
            className="text-sm text-emerald-800"
          >
            {message}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Enviando enlace…" : "Enviar enlace de recuperación"}
        </Button>
      </form>
    </AuthPageShell>
  );
}
