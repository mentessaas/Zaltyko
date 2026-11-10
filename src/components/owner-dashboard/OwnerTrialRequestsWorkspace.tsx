"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Copy, Inbox, Mail, Phone } from "lucide-react";

import {
  trialRequestShareUrl,
  trialRequestStatusLabels,
  type TrialRequestStatus,
} from "@/modules/admissions/domain/trial-request";

import { ownerUi } from "./owner-ui";

const ENDPOINT = "/api/v1/owner/trial-requests";
const PAGE_SIZE = 25;
const RELATIONSHIPS = ["parent", "legal_guardian", "foster_guardian", "other"] as const;
type Relationship = (typeof RELATIONSHIPS)[number];
const relationshipLabels: Record<Relationship, string> = {
  parent: "Madre, padre o progenitor",
  legal_guardian: "Tutor legal",
  foster_guardian: "Acogida o guarda",
  other: "Otra relación responsable",
};

type Location = { id: string; name: string };
type RequestItem = {
  id: string;
  locationId: string;
  locationName: string;
  status: TrialRequestStatus;
  contactName: string;
  contactEmail: string;
  contactPhone: string | null;
  athleteGivenName: string;
  athleteBirthYear: number | null;
  message: string | null;
  createdAt: string;
  revision: number;
  convertedAthleteId: string | null;
  waitlistEntryId: string | null;
};
type RequestPage = {
  available: boolean;
  items: RequestItem[];
  total: number;
  page: number;
  hasMore: boolean;
  counts: { new: number; contacted: number; closed: number };
  classOptions: Array<{ id: string; name: string; locationId: string }>;
  canConvert: boolean;
};
type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; data: RequestPage }
  | { kind: "error"; message: string };

const dateFormatter = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

async function problemDetail(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => null)) as { detail?: unknown } | null;
  return typeof body?.detail === "string" && body.detail.trim() ? body.detail : fallback;
}

function statusChip(status: TrialRequestStatus): string {
  if (status === "new") return ownerUi.chipAttention;
  if (status === "contacted") return ownerUi.chipAccent;
  return ownerUi.chip;
}

export function OwnerTrialRequestsWorkspace({
  organizationId,
  organizationName,
  locations,
  initialLocationId,
}: {
  organizationId: string;
  organizationName: string;
  locations: Location[];
  initialLocationId: string | null;
}) {
  const [locationId, setLocationId] = useState<string | null>(initialLocationId);
  const [view, setView] = useState<"open" | "closed">("open");
  const [page, setPage] = useState(1);
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [origin, setOrigin] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<{ id: string; message: string } | null>(null);

  useEffect(() => setOrigin(window.location.origin), []);

  const load = useCallback(async () => {
    setState((current) => (current.kind === "ready" ? current : { kind: "loading" }));
    const params = new URLSearchParams({
      organizationId,
      view,
      page: String(page),
      pageSize: String(PAGE_SIZE),
    });
    if (locationId) params.set("locationId", locationId);
    try {
      const response = await fetch(`${ENDPOINT}?${params.toString()}`, {
        headers: { accept: "application/json" },
        cache: "no-store",
      });
      if (!response.ok) {
        setState({ kind: "error", message: await problemDetail(response, "No se pudieron cargar las solicitudes.") });
        return;
      }
      const body = (await response.json()) as { data: RequestPage };
      setState({ kind: "ready", data: body.data });
    } catch {
      setState({ kind: "error", message: "No se pudieron cargar las solicitudes. Revisa la conexión." });
    }
  }, [organizationId, view, page, locationId]);

  useEffect(() => {
    void load();
  }, [load]);

  const shareLinks = useMemo(() => {
    if (!origin) return [];
    const visible = locationId ? locations.filter((location) => location.id === locationId) : locations;
    if (visible.length === 1) {
      return [{ label: visible[0]!.name, url: trialRequestShareUrl(origin, organizationId, visible[0]!.id) }];
    }
    return [
      { label: "Todas las sedes (la familia elige)", url: trialRequestShareUrl(origin, organizationId) },
      ...visible.map((location) => ({
        label: location.name,
        url: trialRequestShareUrl(origin, organizationId, location.id),
      })),
    ];
  }, [origin, locationId, locations, organizationId]);

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setNotice("Enlace copiado.");
    } catch {
      setNotice("No se pudo copiar. Selecciona el enlace y cópialo a mano.");
    }
  }

  async function mutate(item: RequestItem, path: "status" | "convert", body: Record<string, unknown>) {
    setBusyId(item.id);
    setActionError(null);
    try {
      const response = await fetch(`${ENDPOINT}/${item.id}/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ organizationId, expectedRevision: item.revision, ...body }),
      });
      if (!response.ok) {
        setActionError({ id: item.id, message: await problemDetail(response, "No se pudo guardar el cambio.") });
        if (response.status === 409) await load();
        return false;
      }
      await load();
      return true;
    } catch {
      setActionError({ id: item.id, message: "No se pudo guardar el cambio. Revisa la conexión." });
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function onConvert(event: FormEvent<HTMLFormElement>, item: RequestItem) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const destination = form.get("destination") === "waitlist" ? "waitlist" : "enrollment";
    const ok = await mutate(item, "convert", {
      familyName: String(form.get("familyName") ?? "").trim(),
      relationship: String(form.get("relationship") ?? "parent"),
      destination,
      classTemplateId: destination === "waitlist" ? String(form.get("classTemplateId") ?? "") || null : null,
    });
    if (ok) {
      setConvertingId(null);
      setNotice(
        destination === "waitlist"
          ? `${item.athleteGivenName} ya está en la lista de espera.`
          : `${item.athleteGivenName} ya tiene ficha. Asígnale grupo en Gimnastas para inscribirla.`
      );
    }
  }

  const data = state.kind === "ready" ? state.data : null;

  return (
    <main className={ownerUi.page}>
      <header className={ownerUi.pageHeader}>
        <p className={ownerUi.eyebrow}>Personas</p>
        <h1 className={ownerUi.pageTitle}>Solicitudes</h1>
        <p className={ownerUi.pageLead}>
          Familias que piden una clase de prueba en {organizationName}. Respóndeles y, cuando os pongáis de
          acuerdo, pásalas a inscripción o a lista de espera sin volver a escribir sus datos.
        </p>
      </header>

      {data && !data.available ? (
        <p role="status" className={`${ownerUi.noticeWarning} mb-6`}>
          <strong>Pendiente de activar.</strong> Las solicitudes en línea se activarán cuando se instale su
          almacenamiento. Mientras tanto, el enlace dice a las familias que la academia aún no recibe
          solicitudes en línea.
        </p>
      ) : null}

      <section aria-labelledby="trial-share-title" className={`${ownerUi.card} mb-6`}>
        <h2 id="trial-share-title" className={ownerUi.sectionTitle}>
          Enlace para familias
        </h2>
        <p className={`${ownerUi.muted} mt-2`}>
          Ponlo en tu web, en redes o en un mensaje. No envía correos ni crea cuentas: la solicitud llega aquí.
        </p>
        <ul className="mt-4 grid gap-3">
          {shareLinks.map((link) => (
            <li key={link.url} className="grid gap-1.5">
              <span className={ownerUi.smallLabel}>{link.label}</span>
              <div className="flex min-w-0 gap-2">
                <input readOnly value={link.url} aria-label={`Enlace: ${link.label}`} className={ownerUi.field} />
                <button
                  type="button"
                  className={ownerUi.iconButton}
                  onClick={() => void copy(link.url)}
                  aria-label={`Copiar enlace: ${link.label}`}
                >
                  <Copy aria-hidden="true" className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {notice ? (
        <p role="status" className={`${ownerUi.noticeInfo} mb-6`}>
          {notice}
        </p>
      ) : null}

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div role="tablist" aria-label="Estado de las solicitudes" className="flex gap-2">
          {(["open", "closed"] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="tab"
              aria-selected={view === option}
              className={view === option ? ownerUi.primaryButton : ownerUi.secondaryButton}
              onClick={() => {
                setView(option);
                setPage(1);
              }}
            >
              {option === "open"
                ? `Pendientes${data ? ` (${data.counts.new + data.counts.contacted})` : ""}`
                : `Cerradas${data ? ` (${data.counts.closed})` : ""}`}
            </button>
          ))}
        </div>
        {locations.length > 1 ? (
          <label className="grid min-w-[12rem] gap-1.5">
            <span className={ownerUi.smallLabel}>Sede</span>
            <select
              className={ownerUi.field}
              value={locationId ?? ""}
              onChange={(event) => {
                setLocationId(event.target.value || null);
                setPage(1);
              }}
            >
              <option value="">Todas mis sedes</option>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {state.kind === "loading" ? (
        <p role="status" className={ownerUi.muted}>
          Cargando solicitudes…
        </p>
      ) : state.kind === "error" ? (
        <div role="alert" className={ownerUi.noticeError}>
          {state.message}{" "}
          <button type="button" className={ownerUi.textLink} onClick={() => void load()}>
            Reintentar
          </button>
        </div>
      ) : data && data.items.length === 0 ? (
        <div className={ownerUi.emptyState}>
          <span className={ownerUi.emptyIcon}>
            <Inbox aria-hidden="true" className="h-5 w-5" />
          </span>
          <p className="font-semibold text-z-ink">
            {view === "open" ? "No hay solicitudes pendientes" : "Todavía no hay solicitudes cerradas"}
          </p>
          <p className={`${ownerUi.muted} mt-1 max-w-md`}>
            {view === "open"
              ? "Cuando una familia use el enlace, su solicitud aparecerá aquí y en «Necesita tu atención»."
              : "Las solicitudes pasadas a inscripción, a lista de espera o descartadas se guardan aquí."}
          </p>
        </div>
      ) : data ? (
        <>
          {!data.canConvert && view === "open" ? (
            <p className={`${ownerUi.help} mb-3`}>
              Pasar una solicitud a inscripción o a lista de espera lo hace la dirección o la administración
              con acceso a todas las sedes. Tú puedes marcarla como contactada o descartarla.
            </p>
          ) : null}
          <ul className="grid gap-3">
            {data.items.map((item) => {
              const classes = data.classOptions.filter((option) => option.locationId === item.locationId);
              const busy = busyId === item.id;
              return (
                <li key={item.id} className={ownerUi.listItem}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="break-words text-base font-semibold text-z-ink">
                        {item.athleteGivenName}
                        {item.athleteBirthYear ? (
                          <span className="font-normal text-z-soft"> · año de nacimiento {item.athleteBirthYear}</span>
                        ) : null}
                      </p>
                      <p className={ownerUi.help}>
                        {item.locationName} · {dateFormatter.format(new Date(item.createdAt))}
                      </p>
                    </div>
                    <span className={statusChip(item.status)}>{trialRequestStatusLabels[item.status]}</span>
                  </div>
                  <div className="mt-3 grid gap-1 text-sm text-z-ink">
                    <p className="break-words">
                      <span className="font-semibold">{item.contactName}</span>
                    </p>
                    <p className="flex flex-wrap gap-x-4 gap-y-1">
                      <a className={`${ownerUi.textLink} inline-flex items-center gap-1.5`} href={`mailto:${item.contactEmail}`}>
                        <Mail aria-hidden="true" className="h-4 w-4" />
                        <span className="break-all">{item.contactEmail}</span>
                      </a>
                      {item.contactPhone ? (
                        <a className={`${ownerUi.textLink} inline-flex items-center gap-1.5`} href={`tel:${item.contactPhone.replace(/[^+0-9]/g, "")}`}>
                          <Phone aria-hidden="true" className="h-4 w-4" />
                          {item.contactPhone}
                        </a>
                      ) : null}
                    </p>
                    {item.message ? (
                      <p className={`${ownerUi.subtlePanel} mt-2 whitespace-pre-line break-words`}>{item.message}</p>
                    ) : null}
                  </div>

                  {actionError?.id === item.id ? (
                    <p role="alert" className={`${ownerUi.noticeError} mt-3`}>
                      {actionError.message}
                    </p>
                  ) : null}

                  <div className="mt-4 flex flex-wrap gap-2">
                    {item.status === "new" ? (
                      <button
                        type="button"
                        className={ownerUi.secondaryButton}
                        disabled={busy}
                        onClick={() => void mutate(item, "status", { status: "contacted" })}
                      >
                        Marcar como contactada
                      </button>
                    ) : null}
                    {item.status === "new" || item.status === "contacted" ? (
                      <>
                        {data.canConvert ? (
                          <button
                            type="button"
                            className={ownerUi.primaryButton}
                            disabled={busy}
                            aria-expanded={convertingId === item.id}
                            onClick={() => setConvertingId(convertingId === item.id ? null : item.id)}
                          >
                            Pasar a inscripción o lista de espera
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className={ownerUi.secondaryButton}
                          disabled={busy}
                          onClick={() => void mutate(item, "status", { status: "declined" })}
                        >
                          Descartar
                        </button>
                      </>
                    ) : null}
                    {item.status === "declined" ? (
                      <button
                        type="button"
                        className={ownerUi.secondaryButton}
                        disabled={busy}
                        onClick={() => void mutate(item, "status", { status: "contacted" })}
                      >
                        Reabrir
                      </button>
                    ) : null}
                    {item.status === "converted" && data.canConvert ? (
                      <Link
                        className={ownerUi.secondaryButton}
                        href={`/owner/athletes?${new URLSearchParams({ organizationId }).toString()}`}
                      >
                        Asignar grupo en Gimnastas
                      </Link>
                    ) : null}
                  </div>

                  {convertingId === item.id && data.canConvert ? (
                    <form
                      onSubmit={(event) => void onConvert(event, item)}
                      className={`${ownerUi.subtlePanel} mt-4 grid gap-4`}
                      aria-label={`Pasar a ${item.athleteGivenName} a inscripción o lista de espera`}
                    >
                      <label className="grid gap-1.5">
                        <span className={ownerUi.label}>Apellidos de {item.athleteGivenName}</span>
                        <input name="familyName" required maxLength={100} className={ownerUi.field} disabled={busy} />
                      </label>
                      <label className="grid gap-1.5">
                        <span className={ownerUi.label}>Vínculo de {item.contactName}</span>
                        <select name="relationship" defaultValue="parent" className={ownerUi.field} disabled={busy}>
                          {RELATIONSHIPS.map((relationship) => (
                            <option key={relationship} value={relationship}>
                              {relationshipLabels[relationship]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <fieldset className="grid gap-2">
                        <legend className={ownerUi.label}>Destino</legend>
                        <label className="flex items-start gap-3 text-sm text-z-ink">
                          <input type="radio" name="destination" value="enrollment" defaultChecked className="mt-1" />
                          <span>
                            <strong>Inscripción.</strong> Crea la ficha y la deja en Gimnastas para asignarle grupo.
                          </span>
                        </label>
                        <label className="flex items-start gap-3 text-sm text-z-ink">
                          <input type="radio" name="destination" value="waitlist" className="mt-1" disabled={classes.length === 0} />
                          <span>
                            <strong>Lista de espera.</strong> Crea la ficha y la apunta en la espera de una clase.
                            {classes.length === 0 ? " Esta sede no tiene clases activas." : null}
                          </span>
                        </label>
                        {classes.length > 0 ? (
                          <label className="grid gap-1.5">
                            <span className={ownerUi.smallLabel}>Clase (solo para lista de espera)</span>
                            <select name="classTemplateId" defaultValue="" className={ownerUi.field} disabled={busy}>
                              <option value="">Elige una clase</option>
                              {classes.map((option) => (
                                <option key={option.id} value={option.id}>
                                  {option.name}
                                </option>
                              ))}
                            </select>
                          </label>
                        ) : null}
                      </fieldset>
                      <p className={ownerUi.help}>
                        La familia queda pendiente de completar: añade a {item.contactName} y su contacto desde la
                        ficha cuando lo necesites. No se crea ninguna cuota ni cobro.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button type="submit" className={ownerUi.primaryButton} disabled={busy}>
                          {busy ? "Guardando…" : "Confirmar"}
                        </button>
                        <button
                          type="button"
                          className={ownerUi.secondaryButton}
                          disabled={busy}
                          onClick={() => setConvertingId(null)}
                        >
                          Cancelar
                        </button>
                      </div>
                    </form>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {data.page > 1 || data.hasMore ? (
            <nav aria-label="Páginas de solicitudes" className="mt-4 flex gap-2">
              <button
                type="button"
                className={ownerUi.secondaryButton}
                disabled={data.page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Anterior
              </button>
              <button
                type="button"
                className={ownerUi.secondaryButton}
                disabled={!data.hasMore}
                onClick={() => setPage((current) => current + 1)}
              >
                Siguiente
              </button>
            </nav>
          ) : null}
        </>
      ) : null}
    </main>
  );
}
