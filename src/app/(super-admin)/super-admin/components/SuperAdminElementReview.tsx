"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  ELEMENT_REVIEW_STATE_LABELS,
  ELEMENT_REVIEW_STATES,
  ELEMENT_WITHDRAWAL_REASON_MAX,
  ELEMENT_WITHDRAWAL_REASON_MIN,
  type ElementReviewItem,
  type ElementReviewPage,
  type ElementReviewState,
} from "@/modules/element-library/domain/content-notices";
import { EDITION_CODES, type EditionCode } from "@/modules/element-library/domain/element-library";
import { apparatusLabel, type SkillApparatus } from "@/modules/skill-levels/domain/skill-levels";

const ENDPOINT = "/api/super-admin/element-library/elements";
const fieldClassName =
  "min-h-11 w-full rounded-xl border border-white/15 bg-zaltyko-navy px-3 text-sm text-white outline-none focus-visible:ring-2 focus-visible:ring-zaltyko-electric";

const editionLabels: Record<EditionCode, string> = {
  "fig-wag-2025-2028": "Artística femenina 2025-2028",
  "fig-mag-2025-2028": "Artística masculina 2025-2028",
};

const stateStyles: Record<ElementReviewState, string> = {
  draft: "border-amber-300/30 bg-amber-300/10 text-amber-100",
  reviewed: "border-emerald-300/30 bg-emerald-300/10 text-emerald-100",
  withdrawn: "border-rose-300/30 bg-rose-400/10 text-rose-100",
};

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Fecha no disponible";
  return new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Madrid" }).format(
    date
  );
}

function valueLabel(item: ElementReviewItem): string {
  if (item.valueLetter) return `Valor ${item.valueLetter}`;
  if (item.valuePoints !== null) return `${item.valuePoints.toFixed(2).replace(".", ",")} puntos`;
  return "Sin valor";
}

type Filters = { state: ElementReviewState | ""; edition: EditionCode | "" };

async function fetchElements(cursor: string | null, filters: Filters): Promise<ElementReviewPage> {
  const params = new URLSearchParams();
  if (filters.state) params.set("state", filters.state);
  if (filters.edition) params.set("edition", filters.edition);
  if (cursor) params.set("cursor", cursor);
  const response = await fetch(`${ENDPOINT}?${params}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null);
  if (response.status === 503) {
    throw new Error("Las tablas de la biblioteca todavía no están instaladas en esta base de datos.");
  }
  if (!response.ok || payload?.ok !== true || !Array.isArray(payload?.data?.items)) {
    throw new Error("No se pudieron cargar los elementos. Puedes volver a intentarlo.");
  }
  return payload.data as ElementReviewPage;
}

function WithdrawForm({ item, onDone }: { item: ElementReviewItem; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;
    const form = new FormData(event.currentTarget);
    const reason = String(form.get("reason") ?? "").trim();
    const noticeId = String(form.get("noticeId") ?? "").trim();
    setSending(true);
    setError(null);
    try {
      const response = await fetch(`${ENDPOINT}/${encodeURIComponent(item.id)}/withdraw`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        credentials: "include",
        body: JSON.stringify({ reason, noticeId: noticeId || null }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setError(
          typeof payload?.message === "string" && payload.message
            ? payload.message
            : "No se pudo retirar el elemento. Inténtalo de nuevo."
        );
        return;
      }
      setOpen(false);
      onDone();
    } catch {
      setError("No se pudo retirar el elemento. Inténtalo de nuevo.");
    } finally {
      setSending(false);
    }
  }

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        className="min-h-11 border-rose-200/30 bg-white/5 text-white hover:bg-rose-400/10"
        onClick={() => setOpen(true)}
      >
        Retirar
      </Button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-4 grid gap-3 rounded-xl border border-rose-300/20 bg-rose-400/5 p-4">
      <p className="text-sm leading-6 text-white/80">
        El elemento dejará de verse en la biblioteca al momento y ninguna semilla lo vuelve a mostrar. Las academias que
        lo usan en sus niveles o guiones lo conservan, marcado como retirado.
      </p>
      <label className="grid gap-1.5 text-sm font-medium text-white/85">
        Motivo de la retirada
        <textarea
          name="reason"
          required
          rows={3}
          minLength={ELEMENT_WITHDRAWAL_REASON_MIN}
          maxLength={ELEMENT_WITHDRAWAL_REASON_MAX}
          className={`${fieldClassName} py-2`}
          disabled={sending}
        />
      </label>
      <label className="grid gap-1.5 text-sm font-medium text-white/85">
        <span>
          Referencia del aviso <span className="font-normal text-white/55">(opcional)</span>
        </span>
        <input
          name="noticeId"
          autoComplete="off"
          spellCheck={false}
          placeholder="Referencia que aparece en Avisos"
          className={fieldClassName}
          disabled={sending}
        />
      </label>
      {error ? (
        <p role="alert" className="text-sm leading-6 text-rose-100">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={sending} className="min-h-11 bg-rose-500 text-white hover:bg-rose-600">
          {sending ? "Retirando…" : "Confirmar retirada"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={sending}
          className="min-h-11 border-white/15 bg-white/5 text-white hover:bg-white/10"
          onClick={() => setOpen(false)}
        >
          Cancelar
        </Button>
      </div>
    </form>
  );
}

/**
 * Revisión de la biblioteca de elementos (ADR-0029 §1.6 y §8.3): elementos por
 * estado, de solo lectura, y la acción «Retirar». La revisión de los textos se
 * hace en los archivos de datos del repositorio, no aquí.
 */
export function SuperAdminElementReview() {
  const [items, setItems] = useState<ElementReviewItem[]>([]);
  const [filters, setFilters] = useState<Filters>({ state: "", edition: "" });
  const [cursor, setCursor] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [previousCursors, setPreviousCursors] = useState<Array<string | null>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const requestSequence = useRef(0);

  const load = useCallback(async (pageCursor: string | null, selected: Filters) => {
    const requestId = ++requestSequence.current;
    setLoading(true);
    setError(null);
    try {
      const page = await fetchElements(pageCursor, selected);
      if (requestId !== requestSequence.current) return;
      setItems(page.items);
      setNextCursor(page.nextCursor);
    } catch (caught) {
      if (requestId !== requestSequence.current) return;
      setItems([]);
      setNextCursor(null);
      setError(caught instanceof Error ? caught.message : "No se pudieron cargar los elementos.");
    } finally {
      if (requestId === requestSequence.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(cursor, filters);
    return () => {
      requestSequence.current += 1;
    };
  }, [cursor, filters, load, refreshToken]);

  const changeFilters = (next: Partial<Filters>) => {
    setFilters((current) => ({ ...current, ...next }));
    setCursor(null);
    setPreviousCursors([]);
  };

  return (
    <section className="space-y-6" aria-labelledby="element-review-title" aria-busy={loading}>
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-3xl">
          <p className="font-display text-xs uppercase tracking-[0.28em] text-zaltyko-electric">Biblioteca de elementos</p>
          <h1 id="element-review-title" className="mt-2 font-display text-2xl font-semibold text-white sm:text-3xl">
            Revisión y retirada
          </h1>
          <p className="mt-3 text-sm leading-6 text-white/70">
            Las academias solo ven los elementos revisados de una edición publicada y sin retirar. Los borradores solo se
            ven aquí.
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

      <div className="grid gap-4 sm:grid-cols-2 sm:max-w-2xl">
        <label className="grid gap-2 text-sm font-medium text-white/80">
          Estado
          <select
            value={filters.state}
            onChange={(event) =>
              changeFilters({ state: ELEMENT_REVIEW_STATES.find((state) => state === event.target.value) ?? "" })
            }
            className={fieldClassName}
          >
            <option value="">Todos</option>
            {ELEMENT_REVIEW_STATES.map((state) => (
              <option key={state} value={state}>
                {ELEMENT_REVIEW_STATE_LABELS[state]}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-medium text-white/80">
          Edición
          <select
            value={filters.edition}
            onChange={(event) =>
              changeFilters({ edition: EDITION_CODES.find((code) => code === event.target.value) ?? "" })
            }
            className={fieldClassName}
          >
            <option value="">Todas</option>
            {EDITION_CODES.map((code) => (
              <option key={code} value={code}>
                {editionLabels[code]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-sm text-white/70" role="status" aria-live="polite">
          Cargando elementos…
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
          <p className="font-display text-lg font-semibold text-white">No hay elementos con estos filtros</p>
          <p className="mt-2 text-sm leading-6 text-white/65">Los elementos llegan con las semillas de cada tanda.</p>
        </div>
      ) : (
        <ul className="space-y-4" aria-label="Elementos del catálogo">
          {items.map((item) => (
            <li key={item.id} className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.035] p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h2 className="break-words font-display text-lg font-semibold text-white">{item.name}</h2>
                  <p className="mt-1 break-words text-sm text-white/65">
                    {apparatusLabel(item.apparatus as SkillApparatus)} · grupo {item.group} · {valueLabel(item)} · página{" "}
                    {item.sourcePage} · tanda {item.batch}
                  </p>
                  <p className="mt-1 break-all font-mono text-xs text-white/50">
                    {item.elementKey} · {item.editionCode} ({item.editionStatus})
                  </p>
                </div>
                <span className={`w-fit shrink-0 rounded-full border px-3 py-1.5 text-xs ${stateStyles[item.state]}`}>
                  {ELEMENT_REVIEW_STATE_LABELS[item.state]}
                </span>
              </div>
              {item.description ? (
                <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-white/80">{item.description}</p>
              ) : null}
              {item.state === "withdrawn" && item.withdrawnAt ? (
                <p className="mt-3 rounded-xl border border-rose-300/20 bg-rose-400/5 p-3 text-sm leading-6 text-rose-100">
                  Retirado el {formatDate(item.withdrawnAt)}: <span className="whitespace-pre-wrap break-words">{item.withdrawnReason}</span>
                </p>
              ) : (
                <div className="mt-4">
                  <WithdrawForm item={item} onDone={() => setRefreshToken((value) => value + 1)} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <nav className="flex flex-col gap-3 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between" aria-label="Paginación de elementos">
        <p className="text-sm text-white/55">{items.length > 0 ? `${items.length} elementos en esta página` : ""}</p>
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
