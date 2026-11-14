"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mail, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  CONTACT_REQUEST_REASONS,
  type ContactRequestReason,
} from "@/lib/super-admin/contact-request-types";

interface ContactRequestItem {
  id: string;
  name: string;
  email: string;
  academy: string | null;
  reason: ContactRequestReason;
  message: string;
  createdAt: string;
}

interface ContactRequestPage {
  items: ContactRequestItem[];
  nextCursor: string | null;
}

const reasonLabels: Record<ContactRequestReason, string> = {
  demo: "Solicitar demo",
  network: "Varias sedes o academias",
  sales: "Información comercial",
  migracion: "Migración",
  support: "Soporte técnico",
  billing: "Cobros",
  partnership: "Colaboración",
  market_access: "Acceso asistido por país",
  other: "Otro",
};

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Fecha no disponible";
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Madrid",
  }).format(date);
}

async function fetchContactRequests(
  cursor: string | null,
  reason: ContactRequestReason | ""
): Promise<ContactRequestPage> {
  const params = new URLSearchParams({ limit: "25" });
  if (cursor) params.set("cursor", cursor);
  if (reason) params.set("reason", reason);

  const response = await fetch(`/api/super-admin/contact-requests?${params}`, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null);

  if (
    !response.ok ||
    payload?.ok !== true ||
    !Array.isArray(payload?.data?.items) ||
    !(payload.data.nextCursor === null || typeof payload.data.nextCursor === "string")
  ) {
    throw new Error("No se pudieron cargar las solicitudes.");
  }

  return payload.data as ContactRequestPage;
}

export function SuperAdminContactInbox() {
  const [items, setItems] = useState<ContactRequestItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [previousCursors, setPreviousCursors] = useState<Array<string | null>>([]);
  const [reason, setReason] = useState<ContactRequestReason | "">("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const requestSequence = useRef(0);

  const load = useCallback(async (pageCursor: string | null, selectedReason: ContactRequestReason | "") => {
    const requestId = ++requestSequence.current;
    setLoading(true);
    setError(null);
    try {
      const page = await fetchContactRequests(pageCursor, selectedReason);
      if (requestId !== requestSequence.current) return;
      setItems(page.items);
      setNextCursor(page.nextCursor);
    } catch {
      if (requestId !== requestSequence.current) return;
      setItems([]);
      setNextCursor(null);
      setError("No se pudieron cargar las solicitudes. Puedes volver a intentarlo.");
    } finally {
      if (requestId === requestSequence.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(cursor, reason);
    return () => {
      requestSequence.current += 1;
    };
  }, [cursor, load, reason, refreshToken]);

  const handleReasonChange = (value: string) => {
    const nextReason = value === "" ? "" : CONTACT_REQUEST_REASONS.find((item) => item === value) ?? "";
    setReason(nextReason);
    setCursor(null);
    setPreviousCursors([]);
  };

  const handleNext = () => {
    if (!nextCursor) return;
    setPreviousCursors((current) => [...current, cursor]);
    setCursor(nextCursor);
  };

  const handlePrevious = () => {
    if (previousCursors.length === 0) return;
    const previous = previousCursors[previousCursors.length - 1];
    setPreviousCursors((current) => current.slice(0, -1));
    setCursor(previous);
  };

  return (
    <section className="space-y-6" aria-labelledby="contact-requests-title" aria-busy={loading}>
      <header className="rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(37,211,184,0.14),transparent_38%),linear-gradient(135deg,rgba(255,255,255,0.07),rgba(255,255,255,0.02))] p-5 sm:p-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-3xl">
            <p className="font-display text-xs uppercase tracking-[0.28em] text-zaltyko-electric">
              Bandeja Super Admin
            </p>
            <h1 id="contact-requests-title" className="mt-2 font-display text-2xl font-semibold text-white sm:text-3xl">
              Solicitudes de contacto
            </h1>
            <p className="mt-3 text-sm leading-6 text-white/70">
              Consulta las solicitudes guardadas y redacta una respuesta desde tu aplicación de correo.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 shrink-0 border-white/20 bg-white/5 text-white hover:bg-white/10"
            onClick={() => setRefreshToken((value) => value + 1)}
            disabled={loading}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
            Actualizar
          </Button>
        </div>
        <p className="mt-5 rounded-2xl border border-zaltyko-accent/20 bg-zaltyko-accent/5 px-4 py-3 text-sm leading-6 text-white/75">
          Todas las solicitudes recibidas aparecen aquí, aunque no llegue el aviso por correo. Revisa cada solicitud y responde desde tu aplicación de correo.
        </p>
      </header>

      <div className="flex flex-col gap-2 sm:max-w-sm">
        <label htmlFor="contact-reason-filter" className="text-sm font-medium text-white/80">
          Filtrar por motivo
        </label>
        <select
          id="contact-reason-filter"
          value={reason}
          onChange={(event) => handleReasonChange(event.target.value)}
          className="min-h-11 rounded-xl border border-white/15 bg-zaltyko-navy px-3 text-sm text-white outline-none focus-visible:ring-2 focus-visible:ring-zaltyko-electric"
        >
          <option value="">Todos los motivos</option>
          {CONTACT_REQUEST_REASONS.map((item) => (
            <option key={item} value={item}>{reasonLabels[item]}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-sm text-white/70" role="status" aria-live="polite">
          Cargando solicitudes…
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-rose-300/30 bg-rose-400/10 p-5" role="alert">
          <p className="text-sm leading-6 text-rose-100">{error}</p>
          <Button
            type="button"
            variant="outline"
            className="mt-4 min-h-11 border-rose-200/30 bg-white/5 text-white hover:bg-white/10"
            onClick={() => setRefreshToken((value) => value + 1)}
          >
            Reintentar
          </Button>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-8 text-center" role="status">
          <p className="font-display text-lg font-semibold text-white">Todavía no hay solicitudes</p>
          <p className="mt-2 text-sm leading-6 text-white/65">
            Cuando se guarde una solicitud de contacto, aparecerá aquí.
          </p>
        </div>
      ) : (
        <div className="space-y-4" role="region" aria-label="Solicitudes guardadas">
          {items.map((item) => (
            <article key={item.id} className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.035] p-4 sm:p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h2 className="break-words font-display text-lg font-semibold text-white">{item.name}</h2>
                  <p className="mt-1 break-all text-sm text-zaltyko-electric">{item.email}</p>
                  <p className="mt-2 break-words text-sm text-white/65">{item.academy || "Academia no indicada"}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-white/65 sm:justify-end">
                  <span className="rounded-full border border-zaltyko-electric/20 bg-zaltyko-electric/10 px-3 py-1.5 text-zaltyko-electric">
                    {reasonLabels[item.reason] ?? "Otro"}
                  </span>
                  <time dateTime={item.createdAt} className="rounded-full border border-white/10 px-3 py-1.5">
                    {formatDate(item.createdAt)}
                  </time>
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-white/10 bg-black/10 p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-white/55">Mensaje recibido</h3>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-white/85">{item.message}</p>
              </div>

              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs leading-5 text-white/50">
                  Abrir el correo solo prepara un borrador; no envía ni registra una respuesta.
                </p>
                <a
                  href={`mailto:${encodeURIComponent(item.email)}`}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/15 px-4 py-2 text-sm font-medium text-white transition hover:border-zaltyko-electric/40 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zaltyko-electric"
                  aria-label={`Redactar correo para ${item.name}`}
                >
                  <Mail className="h-4 w-4" aria-hidden="true" />
                  Redactar correo
                </a>
              </div>
            </article>
          ))}
        </div>
      )}

      <nav className="flex flex-col gap-3 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between" aria-label="Paginación de solicitudes">
        <p className="text-sm text-white/55">
          {items.length > 0 ? `Mostrando ${items.length} solicitudes en esta página` : ""}
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            className="min-h-11 flex-1 border-white/15 bg-white/5 text-white hover:bg-white/10 sm:flex-none"
            onClick={handlePrevious}
            disabled={loading || previousCursors.length === 0}
          >
            Anterior
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 flex-1 border-white/15 bg-white/5 text-white hover:bg-white/10 sm:flex-none"
            onClick={handleNext}
            disabled={loading || !nextCursor}
          >
            Siguiente
          </Button>
        </div>
      </nav>
    </section>
  );
}
