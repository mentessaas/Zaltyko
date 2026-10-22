"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, UserRoundPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FormField, validators } from "@/components/ui/form-field";
import { useToast } from "@/components/ui/toast-provider";

type AcademyOption = {
  id: string;
  name: string | null;
};

const LINK_ROLES = [
  { value: "coach", label: "Entrenador" },
  { value: "parent", label: "Padre / tutor" },
  { value: "athlete", label: "Atleta" },
  { value: "admin", label: "Admin" },
] as const;

interface RequestUserLinkFormProps {
  academies: AcademyOption[];
  disabled?: boolean;
}

export function RequestUserLinkForm({ academies, disabled = false }: RequestUserLinkFormProps) {
  const router = useRouter();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [academyId, setAcademyId] = useState(academies[0]?.id ?? "");
  const [role, setRole] = useState<(typeof LINK_ROLES)[number]["value"]>("parent");
  const [message, setMessage] = useState("");
  const [sendEmail, setSendEmail] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedAcademyName = useMemo(
    () => academies.find((academy) => academy.id === academyId)?.name ?? "la academia",
    [academies, academyId]
  );

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email || !academyId) {
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/link-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          academyId,
          email,
          role,
          message: message.trim() || undefined,
          sendEmail,
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.message ?? payload?.error ?? "No se pudo crear la solicitud");
      }

      toast.pushToast({
        title: "Solicitud enviada",
        description: `La cuenta recibira una solicitud para vincularse con ${selectedAcademyName}.`,
        variant: "success",
      });
      setEmail("");
      setMessage("");
      router.refresh();
    } catch (error) {
      toast.pushToast({
        title: "No se pudo enviar",
        description: error instanceof Error ? error.message : "Error inesperado al crear la solicitud.",
        variant: "error",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 space-y-4">
      <FormField
        id="link-email"
        label="Email de cuenta existente"
        type="email"
        placeholder="persona@email.com"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        validator={validators.combine(
          validators.required("El correo es obligatorio"),
          validators.email("Ingresa un correo valido")
        )}
        validateOnChange
        validateOnBlur
        disabled={disabled || isSubmitting}
      />

      <div className="space-y-2">
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Academia
        </label>
        <select
          value={academyId}
          onChange={(event) => setAcademyId(event.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-zaltyko-primary focus:outline-none focus:ring-1 focus:ring-zaltyko-primary disabled:cursor-not-allowed disabled:bg-muted"
          disabled={disabled || isSubmitting || academies.length === 0}
        >
          {academies.map((academy) => (
            <option key={academy.id} value={academy.id}>
              {academy.name ?? "(sin nombre)"}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Vincular como
        </label>
        <select
          value={role}
          onChange={(event) => setRole(event.target.value as typeof role)}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-zaltyko-primary focus:outline-none focus:ring-1 focus:ring-zaltyko-primary disabled:cursor-not-allowed disabled:bg-muted"
          disabled={disabled || isSubmitting}
        >
          {LINK_ROLES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <label
          htmlFor="link-message"
          className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
        >
          Mensaje opcional
        </label>
        <textarea
          id="link-message"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          maxLength={500}
          rows={3}
          className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-zaltyko-primary focus:outline-none focus:ring-1 focus:ring-zaltyko-primary disabled:cursor-not-allowed disabled:bg-muted"
          disabled={disabled || isSubmitting}
        />
      </div>

      <label className="flex items-start gap-2 rounded-md border border-border bg-muted/30 p-3 text-sm">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 rounded border-border text-zaltyko-primary focus:ring-zaltyko-primary"
          checked={sendEmail}
          onChange={(event) => setSendEmail(event.target.checked)}
          disabled={disabled || isSubmitting}
        />
        <span>
          <span className="block font-medium text-foreground">Avisar tambien por email</span>
          <span className="block text-xs text-muted-foreground">
            La solicitud siempre queda dentro de Zaltyko; el email solo ayuda a traer al usuario de vuelta.
          </span>
        </span>
      </label>

      <Button type="submit" className="w-full" disabled={disabled || isSubmitting || !email || !academyId}>
        {isSubmitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Enviando...
          </>
        ) : (
          <>
            <UserRoundPlus className="mr-2 h-4 w-4" />
            Solicitar vinculo
          </>
        )}
      </Button>
    </form>
  );
}
