"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ArrowRight, Building2, MapPin, ShieldCheck } from "lucide-react";

export function OwnerSetupForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [primaryDiscipline, setPrimaryDiscipline] = useState<
    "artistic" | "rhythmic" | null
  >(null);
  const idempotencyKey = useRef<string | null>(null);

  async function submit(formData: FormData) {
    setPending(true);
    setError(null);
    const organizationName = String(formData.get("organizationName") ?? "");
    const locationName = String(formData.get("locationName") ?? "");
    const primaryDiscipline = String(formData.get("primaryDiscipline") ?? "");
    const additionalDisciplines = formData
      .getAll("additionalDisciplines")
      .map(String);
    const complementaryActivities = formData
      .getAll("complementaryActivities")
      .map(String);
    const customActivityName = String(
      formData.get("customActivityName") ?? ""
    ).trim();
    const requestKey = idempotencyKey.current ?? crypto.randomUUID();
    idempotencyKey.current = requestKey;
    try {
      const response = await fetch("/api/v1/organizations/bootstrap", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": requestKey,
        },
        body: JSON.stringify({
          organizationName,
          locationName,
          primaryDiscipline,
          additionalDisciplines,
          complementaryActivities,
          customActivityName: customActivityName || undefined,
          countryCode: "ES",
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
    <form action={submit} className="mt-8 grid gap-6">
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
      <fieldset className="grid gap-3">
        <legend className="text-sm font-bold text-slate-800">
          ¿Cuál es la especialidad principal de tu academia?
        </legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="touch-target flex cursor-pointer items-center gap-3 border border-slate-400 bg-white px-4 py-3 text-sm font-semibold text-slate-900 has-[:checked]:border-teal-800 has-[:checked]:bg-teal-50">
            <input
              type="radio"
              name="primaryDiscipline"
              value="artistic"
              required
              onChange={() => setPrimaryDiscipline("artistic")}
              className="h-5 w-5 accent-teal-800"
            />
            Gimnasia artística
          </label>
          <label className="touch-target flex cursor-pointer items-center gap-3 border border-slate-400 bg-white px-4 py-3 text-sm font-semibold text-slate-900 has-[:checked]:border-teal-800 has-[:checked]:bg-teal-50">
            <input
              type="radio"
              name="primaryDiscipline"
              value="rhythmic"
              required
              onChange={() => setPrimaryDiscipline("rhythmic")}
              className="h-5 w-5 accent-teal-800"
            />
            Gimnasia rítmica
          </label>
        </div>
      </fieldset>
      <details className="border border-slate-300 bg-white">
        <summary className="touch-target cursor-pointer px-4 py-3 text-sm font-semibold text-slate-800">
          Añadir otras disciplinas o actividades (opcional)
        </summary>
        <fieldset className="grid gap-3 border-t border-slate-200 p-4">
          <legend className="px-1 text-sm text-slate-600">
            Puedes añadirlas ahora o más adelante.
          </legend>
          {primaryDiscipline && (
            <label className="touch-target flex cursor-pointer items-start gap-3 border border-slate-300 bg-white px-4 py-3 text-sm text-slate-800">
              <input
                type="checkbox"
                name="additionalDisciplines"
                value={
                  primaryDiscipline === "artistic" ? "rhythmic" : "artistic"
                }
                className="mt-0.5 h-5 w-5 accent-teal-800"
              />
              <span>
                También ofrecemos gimnasia{" "}
                {primaryDiscipline === "artistic" ? "rítmica" : "artística"}
              </span>
            </label>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              ["aerial_silks", "Telas aéreas"],
              ["aerial_hoop", "Aro aéreo"],
              ["dance", "Baile"],
              ["physical_conditioning", "Preparación física"],
            ].map(([value, label]) => (
              <label
                key={value}
                className="touch-target flex cursor-pointer items-center gap-3 border border-slate-300 bg-white px-4 py-3 text-sm text-slate-800"
              >
                <input
                  type="checkbox"
                  name="complementaryActivities"
                  value={value}
                  className="h-5 w-5 accent-teal-800"
                />
                {label}
              </label>
            ))}
          </div>
          <label className="grid gap-2 text-sm font-semibold text-slate-800">
            Otra actividad (opcional)
            <input
              name="customActivityName"
              maxLength={80}
              placeholder="Por ejemplo, acrobacia"
              className="touch-target w-full border border-slate-400 bg-white px-3 text-slate-950"
            />
          </label>
          <p className="text-sm leading-6 text-slate-600">
            Cada actividad tendrá sus propias clases y grupos. Podrás añadir más
            adelante.
          </p>
        </fieldset>
      </details>
      <div className="grid gap-5 sm:grid-cols-2">
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
      </div>
      <div className="flex gap-3 border-l-4 border-teal-800 bg-[#F1F3EF] p-4 text-sm leading-6 text-slate-700">
        <ShieldCheck
          className="mt-0.5 h-5 w-5 shrink-0 text-teal-800"
          aria-hidden="true"
        />
        <p>
          Crearemos tu academia y la primera sede de forma segura, y te daremos
          acceso de administración. La moneda y la zona horaria se ajustan
          automáticamente para España. No importaremos datos de otro sistema.
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
