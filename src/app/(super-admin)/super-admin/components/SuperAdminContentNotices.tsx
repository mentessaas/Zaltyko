"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  CONTENT_NOTICE_KIND_LABELS,
  CONTENT_NOTICE_RESPONSE_MAX,
  CONTENT_NOTICE_STATUS_LABELS,
  CONTENT_NOTICE_STATUSES,
  type ContentNoticePage,
  type ContentNoticeStatus,
  type ContentNoticeView,
} from "@/modules/element-library/domain/content-notices";

const ENDPOINT = "/api/super-admin/content-notices";
const fieldClassName =
  "min-h-11 w-full rounded-xl border border-white/15 bg-zaltyko-navy px-3 text-sm text-white outline-none focus-visible:ring-2 focus-visible:ring-zaltyko-electric";

const statusStyles: Record<ContentNoticeStatus, string> = {
  received: "border-amber-300/30 bg-amber-300/10 text-amber-100",
  reviewing: "border-sky-300/30 bg-sky-300/10 text-sky-100",
  closed: "border-white/15 bg-white/5 text-white/70",
};

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Fecha no disponible";
  return new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Madrid" }).format(
    date
  );
}

async function fetchNotices(cursor: string | null, status: ContentNoticeStatus | ""): Promise<ContentNoticePage> {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (cursor) params.set("cursor", cursor);
  const response = await fetch(`${ENDPOINT}?${params}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null);
  if (response.status === 503) {
    throw new Error("Las tablas de avisos todavía no están instaladas en esta base de datos.");
  }
  if (!response.ok || payload?.ok !== true || !Array.isArray(payload?.data?.items)) {
    throw new Error("No se pudieron cargar los avisos. Puedes volver a intentarlo.");
  }
  return payload.data as ContentNoticePage;
}

function NoticeEditor({ notice, onSaved }: { notice: ContentNoticeView; onSaved: (notice: ContentNoticeView) => void }) {
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<ContentNoticeStatus>(notice.status);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  async function save(body: { status?: ContentNoticeStatus; response?: string }) {
    setSending(true);
    setMessage(null);
    try {
      const response = await fetch(`${ENDPOINT}/${encodeURIComponent(notice.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.ok !== true) {
        setMessage({
          kind: "error",
          text:
            typeof payload?.message === "string" && payload.message
              ? payload.message
              : "No se pudo guardar el aviso. Inténtalo de nuevo.",
        });
        return;
      }
      const saved = payload.data as ContentNoticeView;
      setStatus(saved.status);
      onSaved(saved);
      setMessage({ kind: "ok", text: "Guardado." });
    } catch {
      setMessage({ kind: "error", text: "No se pudo guardar el aviso. Inténtalo de nuevo." });
    } finally {
      setSending(false);
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;
    const form = new FormData(event.currentTarget);
    void save({ status, response: String(form.get("response") ?? "") });
  }

  return (
    <form onSubmit={onSubmit} className="mt-4 grid gap-3 border-t border-white/10 pt-4">
      <label className="grid gap-1.5 text-sm font-medium text-white/85 sm:max-w-xs">
        Estado
        <select
          name="status"
          value={status}
          onChange={(event) => setStatus(CONTENT_NOTICE_STATUSES.find((value) => value === event.target.value) ?? status)}
          className={fieldClassName}
          disabled={sending}
        >
          {CONTENT_NOTICE_STATUSES.map((status) => (
            <option key={status} value={status}>
              {CONTENT_NOTICE_STATUS_LABELS[status]}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1.5 text-sm font-medium text-white/85">
        <span>
          Respuesta <span className="font-normal text-white/55">(se guarda aquí; el correo se envía aparte)</span>
        </span>
        <textarea
          name="response"
          rows={3}
          maxLength={CONTENT_NOTICE_RESPONSE_MAX}
          defaultValue={notice.response ?? ""}
          className={`${fieldClassName} py-2`}
          disabled={sending}
        />
      </label>
      {message ? (
        <p role={message.kind === "error" ? "alert" : "status"} className={`text-sm ${message.kind === "error" ? "text-rose-100" : "text-emerald-100"}`}>
          {message.text}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={sending} className="min-h-11">
          {sending ? "Guardando…" : "Guardar"}
        </Button>
        {notice.status !== "closed" ? (
          <Button
            type="button"
            variant="outline"
            disabled={sending}
            className="min-h-11 border-white/15 bg-white/5 text-white hover:bg-white/10"
            onClick={() => void save({ status: "closed" })}
          >
            Cerrar aviso
          </Button>
        ) : null}
      </div>
    </form>
  );
}

/**
 * Registro de avisos sobre contenido (ADR-0029 §8.2). Todo el texto que llega
 * del formulario público se muestra como texto: ni enlaces activos ni HTML.
 * Un aviso no retira nada; la retirada se hace desde Biblioteca.
 */
export function SuperAdminContentNotices() {
  const [items, setItems] = useState<ContentNoticeView[]>([]);
  const [status, setStatus] = useState<ContentNoticeStatus | "">("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [previousCursors, setPreviousCursors] = useState<Array<string | null>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const requestSequence = useRef(0);

  const load = useCallback(async (pageCursor: string | null, selected: ContentNoticeStatus | "") => {
    const requestId = ++requestSequence.current;
    setLoading(true);
    setError(null);
    try {
      const page = await fetchNotices(pageCursor, selected);
      if (requestId !== requestSequence.current) return;
      setItems(page.items);
      setNextCursor(page.nextCursor);
    } catch (caught) {
      if (requestId !== requestSequence.current) return;
      setItems([]);
      setNextCursor(null);
      setError(caught instanceof Error ? caught.message : "No se pudieron cargar los avisos.");
    } finally {
      if (requestId === requestSequence.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(cursor, status);
    return () => {
      requestSequence.current += 1;
    };
  }, [cursor, load, refreshToken, status]);

  const replace = (updated: ContentNoticeView) =>
    setItems((current) => current.map((item) => (item.id === updated.id ? updated : item)));

  return (
    <section className="space-y-6" aria-labelledby="content-notices-title" aria-busy={loading}>
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-3xl">
          <p className="font-display text-xs uppercase tracking-[0.28em] text-zaltyko-electric">Biblioteca de elementos</p>
          <h1 id="content-notices-title" className="mt-2 font-display text-2xl font-semibold text-white sm:text-3xl">
            Avisos sobre contenido
          </h1>
          <p className="mt-3 text-sm leading-6 text-white/70">
            Avisos recibidos desde /avisos-de-contenido. Un aviso no retira nada: si hay que retirar un elemento, hazlo
            desde Biblioteca con la referencia del aviso. Nombre y correo se borran dos años después de cerrar el aviso.
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
      </header>

      <label className="grid gap-2 text-sm font-medium text-white/80 sm:max-w-xs">
        Filtrar por estado
        <select
          value={status}
          onChange={(event) => {
            setStatus(CONTENT_NOTICE_STATUSES.find((value) => value === event.target.value) ?? "");
            setCursor(null);
            setPreviousCursors([]);
          }}
          className={fieldClassName}
        >
          <option value="">Todos</option>
          {CONTENT_NOTICE_STATUSES.map((value) => (
            <option key={value} value={value}>
              {CONTENT_NOTICE_STATUS_LABELS[value]}
            </option>
          ))}
        </select>
      </label>

      {loading ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-sm text-white/70" role="status" aria-live="polite">
          Cargando avisos…
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
          <p className="font-display text-lg font-semibold text-white">No hay avisos</p>
          <p className="mt-2 text-sm leading-6 text-white/65">Cuando alguien envíe un aviso, aparecerá aquí.</p>
        </div>
      ) : (
        <ul className="space-y-4" aria-label="Avisos recibidos">
          {items.map((notice) => (
            <li key={notice.id} className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.035] p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h2 className="font-display text-lg font-semibold text-white">{CONTENT_NOTICE_KIND_LABELS[notice.contentKind]}</h2>
                  <p className="mt-1 text-sm text-white/65">Recibido el {formatDate(notice.receivedAt)}</p>
                  <p className="mt-1 break-all font-mono text-xs text-white/50">Referencia: {notice.id}</p>
                </div>
                <span className={`w-fit shrink-0 rounded-full border px-3 py-1.5 text-xs ${statusStyles[notice.status]}`}>
                  {CONTENT_NOTICE_STATUS_LABELS[notice.status]}
                  {notice.closedAt ? ` · ${formatDate(notice.closedAt)}` : ""}
                </span>
              </div>

              <dl className="mt-4 grid gap-3 text-sm">
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-white/55">Dirección señalada</dt>
                  {/* Como texto: nunca un enlace activo. */}
                  <dd className="mt-1 break-all font-mono text-white/85">{notice.contentUrl}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-white/55">Motivo</dt>
                  <dd className="mt-1 whitespace-pre-wrap break-words leading-6 text-white/85">{notice.reason}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-white/55">Quién avisa</dt>
                  <dd className="mt-1 break-words text-white/85">
                    {notice.senderErasedAt
                      ? `Nombre y correo borrados el ${formatDate(notice.senderErasedAt)}`
                      : `${notice.senderName ?? ""} · ${notice.senderEmail ?? ""}`}
                  </dd>
                </div>
              </dl>

              <NoticeEditor key={notice.id} notice={notice} onSaved={replace} />
            </li>
          ))}
        </ul>
      )}

      <nav className="flex flex-col gap-3 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between" aria-label="Paginación de avisos">
        <p className="text-sm text-white/55">{items.length > 0 ? `${items.length} avisos en esta página` : ""}</p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            className="min-h-11 flex-1 border-white/15 bg-white/5 text-white hover:bg-white/10 sm:flex-none"
            onClick={() => {
              const previous = previousCursors[previousCursors.length - 1] ?? null;
              setPreviousCursors((current) => current.slice(0, -1));
              setCursor(previous);
            }}
            disabled={loading || previousCursors.length === 0}
          >
            Anterior
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 flex-1 border-white/15 bg-white/5 text-white hover:bg-white/10 sm:flex-none"
            onClick={() => {
              if (!nextCursor) return;
              setPreviousCursors((current) => [...current, cursor]);
              setCursor(nextCursor);
            }}
            disabled={loading || !nextCursor}
          >
            Siguiente
          </Button>
        </div>
      </nav>
    </section>
  );
}
