"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FormField, validators } from "@/components/ui/form-field";
import { useToast } from "@/components/ui/toast-provider";

type AcademyOption = {
  id: string;
  name: string | null;
};

interface InviteUserFormProps {
  tenantId?: string;
  availableRoles: string[];
  academies: AcademyOption[];
  disabled?: boolean;
  showTenantSelector?: boolean;
  defaultTenant?: string;
}

export default function InviteUserForm({
  tenantId,
  availableRoles,
  academies,
  disabled = false,
  showTenantSelector = false,
  defaultTenant = "",
}: InviteUserFormProps) {
  const router = useRouter();
  const toast = useToast();

  const [email, setEmail] = useState("");
  const [role, setRole] = useState(availableRoles.includes("coach") ? "coach" : availableRoles[0] ?? "");
  const [selectedAcademies, setSelectedAcademies] = useState<string[]>([]);
  const [defaultAcademyId, setDefaultAcademyId] = useState<string | undefined>();
  const [customTenantId, setCustomTenantId] = useState(defaultTenant);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  const effectiveTenantId = showTenantSelector ? customTenantId || tenantId : tenantId;

  const defaultAcademyOptions = useMemo(() => {
    if (selectedAcademies.length === 0) {
      return [];
    }
    return academies.filter((academy) => selectedAcademies.includes(academy.id));
  }, [academies, selectedAcademies]);

  const handleToggleAcademy = (academyId: string) => {
    setSelectedAcademies((prev) => {
      if (prev.includes(academyId)) {
        const next = prev.filter((id) => id !== academyId);
        if (next.length === 0) {
          setDefaultAcademyId(undefined);
        } else if (defaultAcademyId && !next.includes(defaultAcademyId)) {
          setDefaultAcademyId(next[0]);
        }
        return next;
      }

      const next = [...prev, academyId];
      if (!defaultAcademyId) {
        setDefaultAcademyId(academyId);
      }
      return next;
    });
  };

  const resetForm = () => {
    setEmail("");
    setSelectedAcademies([]);
    setDefaultAcademyId(undefined);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!role || !email) {
      return;
    }
    if (!effectiveTenantId) {
      setMessage({ type: "error", text: "Debes indicar el tenant al que se enviará la invitación." });
      return;
    }

    setIsSubmitting(true);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          role,
          tenantId: effectiveTenantId,
          academyIds: selectedAcademies,
          defaultAcademyId,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error ?? "No se pudo enviar la invitación");
      }

      toast.pushToast({
        title: "Invitación enviada",
        description: "El usuario recibirá un correo con instrucciones.",
        variant: "success",
      });
      resetForm();
      router.refresh();
    } catch (error) {
      console.error(error);
      toast.pushToast({
        title: "Error al enviar invitación",
        description: error instanceof Error ? error.message : "Error inesperado al enviar la invitación.",
        variant: "error",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mt-4 space-y-4">
      {showTenantSelector && (
        <FormField
          id="tenantId"
          label="Tenant ID"
          type="text"
          placeholder="00000000-0000-0000-0000-000000000000"
          value={customTenantId}
          onChange={(event) => setCustomTenantId(event.target.value)}
          validator={validators.required("El Tenant ID es obligatorio")}
          validateOnBlur={true}
          disabled={disabled}
        />
      )}

      <FormField
        id="email"
        label="Correo electrónico"
        type="email"
        placeholder="usuario@academia.com"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        validator={validators.combine(
          validators.required("El correo es obligatorio"),
          validators.email("Ingresa un correo válido")
        )}
        validateOnChange={true}
        validateOnBlur={true}
        disabled={disabled || isSubmitting}
      />

      <div className="space-y-2">
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Rol del perfil
        </label>
        <select
          value={role}
          onChange={(event) => setRole(event.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-zaltyko-primary focus:outline-none focus:ring-1 focus:ring-zaltyko-primary disabled:cursor-not-allowed disabled:bg-muted"
          disabled={disabled || isSubmitting}
        >
          {availableRoles.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Academias asignadas
        </label>
        <div className="flex max-h-48 flex-col gap-2 overflow-y-auto rounded-md border border-border px-3 py-2">
          {academies.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Crea academias primero para asignarlas a los usuarios.
            </p>
          ) : (
            academies.map((academy) => (
              <label key={academy.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-border text-zaltyko-primary focus:ring-zaltyko-primary"
                  checked={selectedAcademies.includes(academy.id)}
                  onChange={() => handleToggleAcademy(academy.id)}
                  disabled={disabled || isSubmitting}
                />
                <span>{academy.name ?? "(sin nombre)"}</span>
              </label>
            ))
          )}
        </div>
      </div>

      {message && (
        <p
          className={`rounded-md px-3 py-2 text-sm ${
            message.type === "error"
              ? "bg-red-50 text-red-700 border border-red-200"
              : "bg-emerald-50 text-emerald-700 border border-emerald-200"
          }`}
        >
          {message.text}
        </p>
      )}

      {defaultAcademyOptions.length > 0 && (
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Academia por defecto
          </label>
          <select
            value={defaultAcademyId ?? ""}
            onChange={(event) =>
              setDefaultAcademyId(event.target.value ? event.target.value : undefined)
            }
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-zaltyko-primary focus:outline-none focus:ring-1 focus:ring-zaltyko-primary disabled:cursor-not-allowed disabled:bg-muted"
            disabled={disabled || isSubmitting}
          >
            {defaultAcademyOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name ?? "(sin nombre)"}
              </option>
            ))}
          </select>
        </div>
      )}

      <Button
        type="submit"
        className="w-full"
        disabled={disabled || isSubmitting || !availableRoles.length || !email}
      >
        {isSubmitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Enviando...
          </>
        ) : (
          "Enviar invitación"
        )}
      </Button>
    </form>
  );
}


