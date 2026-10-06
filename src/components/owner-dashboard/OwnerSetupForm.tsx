"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, Building2, MapPin, ShieldCheck } from "lucide-react";

export function OwnerSetupForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(formData: FormData) {
    setPending(true);
    setError(null);
    const organizationName = String(formData.get("organizationName") ?? "");
    const locationName = String(formData.get("locationName") ?? "");
    const locationCode = String(formData.get("locationCode") ?? "");
    const defaultCurrency = String(formData.get("defaultCurrency") ?? "")
      .trim()
      .toUpperCase();
    try {
      const response = await fetch("/api/v1/organizations/bootstrap", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          organizationName,
          locationName,
          locationCode,
          defaultCurrency,
          countryCode: "ES",
          timezone: "Europe/Madrid",
        }),
      });
      if (!response.ok) {
        const problem = (await response.json().catch(() => null)) as {
          detail?: string;
        } | null;
        throw new Error(problem?.detail ?? "No se ha podido crear el espacio.");
      }
      const result = (await response.json()) as { organizationId: string };
      router.replace(`/owner?organizationId=${result.organizationId}`);
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No se ha podido crear el espacio."
      );
      setPending(false);
    }
  }

  return (
    <form action={submit} className="mt-8 grid gap-5">
      <label className="grid gap-2 text-sm font-bold text-slate-800">
        Nombre de la academia
        <span className="relative">
          <Building2
            className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-500"
            aria-hidden="true"
          />
          <input
            name="organizationName"
            required
            minLength={2}
            maxLength={120}
            autoComplete="organization"
            className="touch-target w-full border border-slate-400 bg-white pl-10 pr-3 text-slate-950"
          />
        </span>
      </label>
      <div className="grid gap-5 sm:grid-cols-[1fr_11rem]">
        <label className="grid gap-2 text-sm font-bold text-slate-800">
          Nombre de la primera sede
          <span className="relative">
            <MapPin
              className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-500"
              aria-hidden="true"
            />
            <input
              name="locationName"
              required
              minLength={2}
              maxLength={120}
              placeholder="Sede principal"
              className="touch-target w-full border border-slate-400 bg-white pl-10 pr-3 text-slate-950"
            />
          </span>
        </label>
        <label className="grid gap-2 text-sm font-bold text-slate-800">
          Código de sede
          <input
            name="locationCode"
            required
            minLength={2}
            maxLength={32}
            pattern="[a-z0-9][a-z0-9-]+"
            placeholder="principal"
            className="touch-target w-full border border-slate-400 bg-white px-3 font-mono text-slate-950"
          />
        </label>
      </div>
      <label className="grid gap-2 text-sm font-bold text-slate-800">
        Moneda base para nuevos cargos
        <input
          name="defaultCurrency"
          required
          minLength={3}
          maxLength={3}
          pattern="[A-Za-z]{3}"
          defaultValue="EUR"
          autoCapitalize="characters"
          aria-describedby="default-currency-help"
          className="touch-target w-full border border-slate-400 bg-white px-3 font-mono uppercase text-slate-950 sm:max-w-48"
        />
        <span id="default-currency-help" className="font-normal text-slate-600">
          Código ISO 4217 de tres letras. Cada movimiento conserva su propia
          moneda; no convertimos importes automáticamente.
        </span>
      </label>
      <div className="flex gap-3 border-l-4 border-teal-800 bg-[#F1F3EF] p-4 text-sm leading-6 text-slate-700">
        <ShieldCheck
          className="mt-0.5 h-5 w-5 shrink-0 text-teal-800"
          aria-hidden="true"
        />
        <p>
          Crearemos una organización, una sede y tu acceso owner en una sola
          transacción. No importaremos datos del sistema anterior.
        </p>
      </div>
      {error && (
        <p
          role="alert"
          className="border border-red-300 bg-red-50 p-3 text-sm text-red-900"
        >
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="touch-target inline-flex items-center justify-center gap-2 bg-slate-950 px-5 py-3 text-sm font-bold text-white hover:bg-teal-900 disabled:bg-slate-500"
      >
        {pending ? "Creando espacio…" : "Crear espacio de dirección"}
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </button>
    </form>
  );
}
