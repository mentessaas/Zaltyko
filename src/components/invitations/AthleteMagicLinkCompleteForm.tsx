"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  stateToken: string;
  expectedEmail: string;
  authenticatedEmail: string | null;
  emailMismatch: boolean;
  expired: boolean;
  customMessage: string | null;
}

export function AthleteMagicLinkCompleteForm(props: Props) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [dob, setDob] = useState("");
  const [level, setLevel] = useState("");
  const [programCode, setProgramCode] = useState("");
  const [levelCode, setLevelCode] = useState("");
  const [categoryCode, setCategoryCode] = useState("");
  const [primaryApparatus, setPrimaryApparatus] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (props.emailMismatch) {
    return (
      <div className="space-y-3">
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p className="font-medium">El email autenticado no coincide con la invitación.</p>
          <p className="mt-2 text-xs">
            Esta invitación se envió a <strong>{props.expectedEmail}</strong>, pero
            tu sesión está con <strong>{props.authenticatedEmail ?? "otro email"}</strong>.
            Cierra sesión y abre el enlace desde el correo original.
          </p>
        </div>
      </div>
    );
  }

  if (props.expired) {
    return (
      <div className="space-y-3">
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-medium">La invitación ha expirado.</p>
          <p className="mt-2 text-xs">
            Pide al staff de tu academia que te envíe una nueva invitación.
          </p>
        </div>
      </div>
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/athletes/invite/complete-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stateToken: props.stateToken,
          name: name.trim(),
          dob: dob.trim() || null,
          level: level.trim() || null,
          programCode: programCode.trim() || null,
          levelCode: levelCode.trim() || null,
          categoryCode: categoryCode.trim() || null,
          primaryApparatus: primaryApparatus.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        const code = json?.error?.code ?? "UNKNOWN";
        const msg =
          code === "INVITATION_NOT_OPENED"
            ? "Tu sesión no está vinculada a la invitación. Cierra sesión y vuelve a abrir el enlace desde el correo."
            : code === "INVITATION_EXPIRED"
              ? "La invitación ha expirado."
              : json?.error?.message ?? "Error al guardar el perfil";
        setError(msg);
        return;
      }
      router.push(json.data?.redirectUrl ?? "/my-dashboard/athlete?welcome=1");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de red");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {props.customMessage && (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Mensaje del club
          </p>
          <p className="mt-1 whitespace-pre-wrap">{props.customMessage}</p>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="email">Email verificado</Label>
        <Input id="email" value={props.expectedEmail} disabled />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="name">Nombre completo *</Label>
        <Input
          id="name"
          required
          minLength={2}
          maxLength={120}
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Lucía Hernández"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="dob">Fecha de nacimiento</Label>
          <Input
            id="dob"
            type="date"
            value={dob}
            onChange={(e) => setDob(e.target.value)}
            max={new Date().toISOString().slice(0, 10)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="level">Nivel</Label>
          <Input
            id="level"
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            placeholder="Iniciación"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="programCode">Programa</Label>
          <Input
            id="programCode"
            value={programCode}
            onChange={(e) => setProgramCode(e.target.value)}
            placeholder="Escuela"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="categoryCode">Categoría</Label>
          <Input
            id="categoryCode"
            value={categoryCode}
            onChange={(e) => setCategoryCode(e.target.value)}
            placeholder="Alevín"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="levelCode">Código nivel</Label>
          <Input
            id="levelCode"
            value={levelCode}
            onChange={(e) => setLevelCode(e.target.value)}
            placeholder="INI-1"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="primaryApparatus">Aparato principal</Label>
          <Input
            id="primaryApparatus"
            value={primaryApparatus}
            onChange={(e) => setPrimaryApparatus(e.target.value)}
            placeholder="Suelo"
          />
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <Button type="submit" className="w-full" disabled={submitting || name.trim().length < 2}>
        {submitting ? "Guardando…" : "Confirmar y entrar"}
      </Button>
    </form>
  );
}