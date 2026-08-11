"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Loader2, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast-provider";

interface OwnerClaimCardProps {
  academyId: string;
  academyName: string;
}

/**
 * Tarjeta "claim academy" — se renderiza cuando el email del usuario
 * autenticado matchea `academies.contactEmail` de una academia registrada.
 * Single-action: un solo botón "Confirmar y entrar" → POST
 * `/api/onboarding/owner/claim`. El endpoint hace el upsert del profile con
 * el `tenantId` existente de la academia (NO genera uno nuevo) + advisory
 * lock + `onConflictDoNothing` memberships.
 *
 * Si el caller (otro agent, doble click, race) ya creó el perfil primero,
 * el endpoint responde 200 con redirect existente — no se duplica.
 */
export function OwnerClaimCard({ academyId, academyName }: OwnerClaimCardProps) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);

  async function handleClaim() {
    setPending(true);
    try {
      const response = await fetch("/api/onboarding/owner/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ academyId }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.error ?? "No se pudo confirmar la academia.");
      }

      const redirectUrl = payload?.data?.redirectUrl ?? `/app/${academyId}/dashboard`;

      toast.pushToast({
        title: "Academia vinculada",
        description: "Entrando a tu espacio de trabajo.",
        variant: "success",
      });

      router.push(redirectUrl);
      router.refresh();
    } catch (error) {
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
    <div className="space-y-6">
      <div className="rounded-xl border bg-muted/30 p-5">
        <div className="flex items-start gap-3">
          <Building2 className="mt-1 h-5 w-5 text-primary" aria-hidden="true" />
          <div className="space-y-1">
            <p className="text-sm font-medium uppercase tracking-wide text-primary">
              Academia detectada
            </p>
            <p className="text-lg font-semibold text-foreground">{academyName}</p>
            <p className="text-sm text-muted-foreground">
              Encontramos una academia registrada con tu email. Confirma que es tuya para
              entrar a tu espacio. No te pediremos teléfono ni datos adicionales.
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-4 text-sm">
        <ShieldCheck className="mt-0.5 h-4 w-4 text-primary" aria-hidden="true" />
        <p className="text-muted-foreground">
          Si esta no es tu academia, cierra sesión y regístrate con otro email — o contacta
          a soporte.
        </p>
      </div>

      <Button
        type="button"
        className="w-full"
        disabled={pending}
        onClick={handleClaim}
        data-testid="owner-claim-confirm"
      >
        {pending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Vinculando academia...
          </>
        ) : (
          <>
            <Building2 className="mr-2 h-4 w-4" />
            Confirmar y entrar
          </>
        )}
      </Button>
    </div>
  );
}