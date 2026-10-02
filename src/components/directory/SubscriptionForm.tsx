"use client";
import Link from "next/link";
import { useState } from "react";
import { directoryFetch, inputClass, buttonClass } from "./EntryEditor";
export function SubscriptionForm({
  purpose,
  filters = {},
}: {
  purpose:
    "calendar" | "favorite_changes" | "marketing" | "kit" | "claim_updates";
  filters?: Record<string, string>;
}) {
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const labels = {
    claim_updates: "Recibir avisos sobre mis solicitudes de representación",
    calendar: "Recibir un resumen semanal de eventos con estos filtros",
    favorite_changes: "Recibir cambios de mis eventos favoritos",
    marketing: "Recibir información comercial y demostraciones de Zaltyko",
    kit: "Recibir el kit por correo",
  };
  return (
    <form
      className="space-y-3 rounded-xl border p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        setBusy(true);
        try {
          const data = await directoryFetch("/api/directory/subscriptions", {
            email: form.get("email"),
            purpose,
            consent: form.get("consent") === "on",
            version: "directory-2026-09-30",
            source:
              purpose === "kit"
                ? "kit"
                : ["favorite_changes", "claim_updates"].includes(purpose)
                  ? "my-listings"
                  : "directory",
            filters,
          });
          setMessage(data.message);
        } catch (err) {
          setMessage(err instanceof Error ? err.message : "No se pudo enviar");
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2 className="text-lg font-semibold">{labels[purpose]}</h2>
      <label>
        Tu correo
        <input name="email" type="email" required className={inputClass} />
      </label>
      <label className="flex gap-2">
        <input name="consent" type="checkbox" required /> Quiero{" "}
        {labels[purpose].toLowerCase()}. Confirmaré mi solicitud por correo y
        podré darme de baja en cualquier momento.
      </label>
      <p className="text-sm">
        Esta solicitud no autoriza otras comunicaciones.{" "}
        <Link href="/politica-privacidad" className="underline">
          Privacidad
        </Link>
      </p>
      <button disabled={busy} className={buttonClass}>
        Solicitar confirmación
      </button>
      <p role="status">{message}</p>
    </form>
  );
}
