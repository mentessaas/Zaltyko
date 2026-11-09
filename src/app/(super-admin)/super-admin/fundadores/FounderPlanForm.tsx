"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";

function defaultUntil() {
  const date = new Date();
  date.setUTCMonth(date.getUTCMonth() + 3);
  return date.toISOString().slice(0, 10);
}

function defaultReference(organizationId: string) {
  const stamp = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `fundador-${organizationId.slice(0, 8)}-${stamp}`;
}

export function FounderPlanForm({
  organizationId,
  organizationName,
}: {
  organizationId: string;
  organizationName: string;
}) {
  const router = useRouter();
  const id = useId();
  const [planCode, setPlanCode] = useState<"starter" | "growth">("growth");
  const [effectiveUntil, setEffectiveUntil] = useState(defaultUntil);
  const [reference] = useState(() => defaultReference(organizationId));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/super-admin/organizations/${organizationId}/founder-plan`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ planCode, effectiveUntil, reference }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage({ tone: "error", text: payload?.message ?? "No se pudo conceder el plan." });
        return;
      }
      setMessage({
        tone: "ok",
        text: payload?.data?.replayed
          ? "Esta concesión ya estaba aplicada."
          : `Plan concedido a ${organizationName} hasta ${effectiveUntil}.`,
      });
      router.refresh();
    } catch {
      setMessage({ tone: "error", text: "Sin respuesta del servidor. Vuelve a intentarlo: la misma concesión no se duplica." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 flex flex-wrap items-end gap-3 border-t border-white/10 pt-4">
      <label className="grid gap-1 text-xs text-white/70" htmlFor={`${id}-plan`}>
        Plan
        <select
          id={`${id}-plan`}
          value={planCode}
          onChange={(event) => setPlanCode(event.target.value as "starter" | "growth")}
          className="min-h-11 rounded-lg border border-white/20 bg-white/10 px-3 text-sm text-white"
        >
          <option value="starter">Starter (75 gimnastas)</option>
          <option value="growth">Growth (200 gimnastas)</option>
        </select>
      </label>
      <label className="grid gap-1 text-xs text-white/70" htmlFor={`${id}-until`}>
        Hasta
        <input
          id={`${id}-until`}
          type="date"
          required
          value={effectiveUntil}
          onChange={(event) => setEffectiveUntil(event.target.value)}
          className="min-h-11 rounded-lg border border-white/20 bg-white/10 px-3 text-sm text-white"
        />
      </label>
      <button
        type="submit"
        disabled={busy}
        className="min-h-11 rounded-lg bg-white px-4 text-sm font-semibold text-zaltyko-navy disabled:opacity-50"
      >
        {busy ? "Concediendo…" : "Conceder plan fundador"}
      </button>
      {message ? (
        <p role={message.tone === "error" ? "alert" : "status"} className={`w-full text-sm ${message.tone === "error" ? "text-rose-300" : "text-emerald-300"}`}>
          {message.text}
        </p>
      ) : null}
    </form>
  );
}
