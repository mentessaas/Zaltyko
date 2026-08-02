"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast-provider";
import { captureUtm, readUtmForSignup, clearStoredUtm } from "@/lib/gtm/utm";

interface OwnerClaimCardProps {
  academyId: string;
  academyName: string;
  city: string | null;
  region: string | null;
  country: string | null;
  contactPhone: string | null;
  suggestedFullName: string;
}

export function OwnerClaimCard({
  academyId,
  academyName,
  city,
  region,
  country,
  contactPhone,
  suggestedFullName,
}: OwnerClaimCardProps) {
  const router = useRouter();
  const toast = useToast();
  const [fullName, setFullName] = useState(suggestedFullName);
  const [pending, setPending] = useState(false);

  const locationLabel = [city, region, country].filter(Boolean).join(", ");

  async function handleConfirm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);

    // ZAL-157 [GTM-DEP.1] — capturamos UTMs en el click de claim. Si el
    // owner llegó por una campaña (gclid en la URL del signup o
    // sessionStorage de la landing previa), los enviamos al backend.
    captureUtm();
    const utm = readUtmForSignup();

    try {
      const response = await fetch("/api/onboarding/owner/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ academyId, fullName, utm: utm ?? null }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { data?: { redirectUrl?: string } }
        | { error?: string; message?: string }
        | null;

      if (!response.ok) {
        throw new Error(
          (payload && "message" in payload && payload.message) ||
            "No se pudo reclamar la academia."
        );
      }

      toast.pushToast({
        title: "Academia reclamada",
        description: "Entrando a tu espacio de trabajo.",
        variant: "success",
      });

      clearStoredUtm();
      const redirectUrl =
        (payload && "data" in payload && payload.data?.redirectUrl) ||
        `/app/${academyId}/dashboard`;
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
    <form onSubmit={handleConfirm} className="space-y-6">
      <div className="space-y-3">
        <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50/80 p-4">
          <ShieldCheck className="mt-0.5 h-5 w-5 text-emerald-700" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-emerald-900">
              Te identificamos como dueña de {academyName}.
            </p>
            {locationLabel ? (
              <p className="text-xs text-emerald-800">{locationLabel}</p>
            ) : null}
            <p className="text-xs text-emerald-800">
              Tu email coincide con el contacto que registramos para esta academia,
              así que no necesitas pedir código postal ni teléfono. Confirma tu
              nombre y entra.
            </p>
            {contactPhone ? (
              <p className="text-xs text-emerald-800">
                Si necesitamos contactarte, usaremos {contactPhone}.
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="claimFullName">Tu nombre</Label>
        <Input
          id="claimFullName"
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          placeholder="Maria Garcia"
          required
          disabled={pending}
          minLength={2}
          maxLength={120}
        />
      </div>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Preparando tu academia...
          </>
        ) : (
          "Confirmar y entrar"
        )}
      </Button>
    </form>
  );
}
