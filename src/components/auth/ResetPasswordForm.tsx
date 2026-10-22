"use client";

import Link from "next/link";
import { useState } from "react";
import { AuthPageShell } from "@/components/auth/AuthPageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

export function ResetPasswordForm({ nextPath }: { nextPath: string }) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  let supabase: ReturnType<typeof createClient> | null = null;
  try {
    supabase = createClient();
  } catch {
    supabase = null;
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (password !== confirmation) {
      setError("Las contraseñas no coinciden.");
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
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });
      if (updateError) {
        setError(
          "El enlace puede haber caducado. Solicita uno nuevo e inténtalo otra vez."
        );
      } else {
        setSaved(true);
      }
    } catch {
      setError(
        "No pudimos cambiar la contraseña. Solicita un enlace nuevo e inténtalo otra vez."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthPageShell
      title="Crea una contraseña nueva"
      description="Elige una contraseña de al menos 8 caracteres."
      footer={
        <Link
          href="/auth/login"
          className="font-semibold text-zaltyko-indigo hover:underline"
        >
          Volver a iniciar sesión
        </Link>
      }
      sideTitle="Protege tu cuenta"
      sideDescription="La nueva contraseña sustituirá a la anterior para acceder a Zaltyko."
      highlights={[
        "Usa al menos 8 caracteres.",
        "Escríbela dos veces para confirmar.",
        "No compartas el enlace de recuperación.",
      ]}
    >
      {saved ? (
        <div className="space-y-4">
          <p
            role="status"
            aria-live="polite"
            className="text-sm text-emerald-800"
          >
            La contraseña se actualizó correctamente.
          </p>
          <Button asChild className="w-full">
            <Link href={nextPath}>Continuar</Link>
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-password">Contraseña nueva</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-new-credential">Repite la contraseña</Label>
            <Input
              id="confirm-new-credential"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Guardando…" : "Guardar contraseña nueva"}
          </Button>
        </form>
      )}
    </AuthPageShell>
  );
}
