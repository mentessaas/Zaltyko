"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface AcceptInvitationFormProps {
  token: string;
  email: string;
  role: string;
}

export default function AcceptInvitationForm({ token, email, role }: AcceptInvitationFormProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setPending(true);
    setError(null);

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

      setCompleted(true);
      setTimeout(() => {
        router.push("/auth/login");
      }, 2500);
    } catch (error) {
      console.error(error);
      setError(error instanceof Error ? error.message : "Error inesperado.");
    } finally {
      setPending(false);
    }
  };

  if (completed) {
    return (
      <div className="space-y-3 text-center">
        <h2 className="text-2xl font-semibold text-emerald-600">Invitación aceptada</h2>
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
        <div className="space-y-1">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Nombre</Label>
          <Input
            placeholder="Tu nombre completo"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            disabled={pending}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Rol asignado</Label>
          <Input value={role} disabled />
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">Contraseña</Label>
        <Input
          type="password"
          placeholder="Mínimo 8 caracteres"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          minLength={8}
          required
          disabled={pending}
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">
          Confirmar contraseña
        </Label>
        <Input
          type="password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          minLength={8}
          required
          disabled={pending}
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Creando cuenta..." : "Aceptar invitación"}
      </Button>
    </form>
  );
}


