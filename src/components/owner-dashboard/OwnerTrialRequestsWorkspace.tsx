"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Copy, Inbox, Mail, Phone } from "lucide-react";

import {
  trialRequestShareUrl,
  trialRequestStatusLabels,
  type TrialRequestStatus,
} from "@/modules/admissions/domain/trial-request";

import { ownerUi } from "./owner-ui";
import { ownerTab, ownerTone } from "./owner-tone-ui";

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
  anonymized: boolean;
  revision: number;
  convertedAthleteId: string | null;
  waitlistEntryId: string | null;
};
type AdmissionLink = { id: string; locationId: string | null; token: string; enabled: boolean };
type RequestPage = {
  available: boolean;
  items: RequestItem[];
  total: number;
  page: number;
  hasMore: boolean;
  counts: { new: number; contacted: number; closed: number };
  links: AdmissionLink[];
  canManage: boolean;
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
  // Nueva: pendiente de responder (aviso en ocre); contactada: en curso (tapiz);
  // cerrada: en reposo (polvo).
  if (status === "new") return ownerTone.chipWarning;
  if (status === "contacted") return ownerTone.chipActive;
  return ownerTone.chipRest;
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
  const busyRef = useRef<string | null>(null);
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

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setNotice("Enlace copiado.");
    } catch {
      setNotice("No se pudo copiar. Selecciona el enlace y cópialo a mano.");
    }
  }

  /** Un único envío a la vez: un doble clic no repite la operación. */
  async function post(busyKey: string, url: string, body: Record<string, unknown>): Promise<boolean> {
    if (busyRef.current) return false;
    busyRef.current = busyKey;
    setBusyId(busyKey);
    setActionError(null);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ organizationId, ...body }),
      });
      if (!response.ok) {
        setActionError({ id: busyKey, message: await problemDetail(response, "No se pudo guardar el cambio.") });
        if (response.status === 409) await load();
        return false;
      }
      await load();
      return true;
    } catch {
      setActionError({ id: busyKey, message: "No se pudo guardar el cambio. Revisa la conexión." });
      return false;
    } finally {
      busyRef.current = null;
      setBusyId(null);
    }
  }

  async function mutate(item: RequestItem, path: "status" | "convert" | "anonymize", body: Record<string, unknown>) {
    if (busyId) return false;
    return post(item.id, `${ENDPOINT}/${item.id}/${path}`, { expectedRevision: item.revision, ...body });
  }

  async function manageLink(linkLocationId: string | null, action: "enable" | "disable" | "regenerate") {
    if (busyId) return;
    const ok = await post(`link:${linkLocationId ?? "all"}`, `${ENDPOINT}/links`, { locationId: linkLocationId, action });
    if (ok) {
      setNotice(
        action === "disable"
          ? "Enlace desactivado: ya no admite solicitudes."
          : action === "regenerate"
            ? "Enlace nuevo creado. El anterior ya no funciona."
            : "Enlace activado."
      );
    }
  }

  async function onConvert(event: FormEvent<HTMLFormElement>, item: RequestItem) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const ok = await mutate(item, "convert", {
      familyName: String(form.get("familyName") ?? "").trim(),
      relationship: String(form.get("relationship") ?? "parent"),
      destination: "enrollment",
      classTemplateId: null,
    });
    if (ok) {
      setConvertingId(null);
      setNotice(`${item.athleteGivenName} ya tiene ficha. Asígnale grupo en Gimnastas para inscribirla.`);
    }
  }

  const data = state.kind === "ready" ? state.data : null;
  const linkSlots: Array<{ locationId: string | null; label: string }> = [
    { locationId: null, label: locations.length > 1 ? "Todas las sedes (la familia elige)" : (locations[0]?.name ?? "Academia") },
    ...(locations.length > 1 ? locations.map((location) => ({ locationId: location.id, label: location.name })) : []),
  ].filter((slot) => !locationId || slot.locationId === null || slot.locationId === locationId);

  return (
    <main className={ownerUi.page}>
      <header className={ownerUi.pageHeader}>
        <p className={ownerUi.eyebrow}>Personas</p>
        <h1 className={ownerUi.pageTitle}>Solicitudes</h1>
        <p className={ownerUi.pageLead}>
          Familias que piden una clase de prueba en {organizationName}. Respóndeles y, cuando os pongáis de
          acuerdo, pásalas a inscripción sin volver a escribir sus datos.
        </p>
      </header>

      {data && !data.available ? (
        <p role="status" className={`${ownerTone.noticeWarning} mb-6`}>
          <strong>Pendiente de activar.</strong> Las solicitudes en línea se activarán cuando se instale su
          almacenamiento. Hasta entonces no se puede crear el enlace para familias.
        </p>
      ) : null}

      {data?.available ? (
        <section aria-labelledby="trial-share-title" className={`${ownerUi.card} mb-6`}>
          <h2 id="trial-share-title" className={ownerUi.sectionTitle}>
            Enlace para familias
          </h2>
          <p className={`${ownerUi.muted} mt-2`}>
            Solo funciona mientras esté activado. Ponlo en tu web, en redes o en un mensaje: no envía correos ni
            crea cuentas, y la solicitud llega aquí.
          </p>
          <ul className="mt-4 grid gap-4">
            {linkSlots.map((slot) => {
              const link = data.links.find((candidate) => candidate.locationId === slot.locationId) ?? null;
              const key = `link:${slot.locationId ?? "all"}`;
              const busy = busyId !== null;
              const url = link && origin ? trialRequestShareUrl(origin, link.token) : null;
              return (
                <li key={key} className="grid gap-2">
                  <span className={ownerUi.smallLabel}>
                    {slot.label} · {link?.enabled ? "Activado" : link ? "Desactivado" : "Sin enlace"}
                  </span>
                  {url && link?.enabled ? (
                    <div className="flex min-w-0 gap-2">
                      <input readOnly value={url} aria-label={`Enlace: ${slot.label}`} className={ownerUi.field} />
                      <button
                        type="button"
                        className={ownerUi.iconButton}
                        onClick={() => void copy(url)}
                        aria-label={`Copiar enlace: ${slot.label}`}
                      >
                        <Copy aria-hidden="true" className="h-4 w-4" />
                      </button>
                    </div>
                  ) : null}
                  {data.canManage ? (
                    <div className="flex flex-wrap gap-2">
                      {!link?.enabled ? (
                        <button type="button" className={ownerUi.primaryButton} disabled={busy} onClick={() => void manageLink(slot.locationId, "enable")}>
                          Activar enlace
                        </button>
                      ) : (
                        <button type="button" className={ownerUi.secondaryButton} disabled={busy} onClick={() => void manageLink(slot.locationId, "disable")}>
                          Desactivar
                        </button>
                      )}
                      {link ? (
                        <button type="button" className={ownerUi.secondaryButton} disabled={busy} onClick={() => void manageLink(slot.locationId, "regenerate")}>
                          Generar enlace nuevo
                        </button>
                      ) : null}
                    </div>
                  ) : !link?.enabled ? (
                    <p className={ownerUi.help}>La dirección o la administración puede activarlo.</p>
                  ) : null}
                  {actionError?.id === key ? (
                    <p role="alert" className={ownerUi.noticeError}>
                      {actionError.message}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {notice ? (
        <p role="status" className={`${ownerUi.noticeInfo} mb-6`}>
          {notice}
        </p>
      ) : null}

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div role="tablist" aria-label="Estado de las solicitudes" className={ownerTone.tabList}>
          {(["open", "closed"] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="tab"
              aria-selected={view === option}
              className={ownerTab(view === option)}
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
              : "Las solicitudes pasadas a inscripción o descartadas se guardan aquí."}
          </p>
        </div>
      ) : data ? (
        <>
          {!data.canManage && view === "open" ? (
            <p className={`${ownerUi.help} mb-3`}>
              Pasar una solicitud a inscripción lo hace la dirección o la administración con acceso a todas las
              sedes. Tú puedes marcarla como contactada o descartarla.
            </p>
          ) : null}
          <ul className="grid gap-3">
            {data.items.map((item) => {
              const busy = busyId !== null;
              return (
                <li key={item.id} className={ownerUi.listItem}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="break-words text-base font-semibold text-z-ink">
                        {item.anonymized ? "Datos eliminados" : item.athleteGivenName}
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
                  {item.anonymized ? null : (
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
                  )}

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
                        {data.canManage ? (
                          <button
                            type="button"
                            className={ownerUi.primaryButton}
                            disabled={busy}
                            aria-expanded={convertingId === item.id}
                            onClick={() => setConvertingId(convertingId === item.id ? null : item.id)}
                          >
                            Pasar a inscripción
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
                    {item.status === "declined" && !item.anonymized ? (
                      <>
                        <button
                          type="button"
                          className={ownerUi.secondaryButton}
                          disabled={busy}
                          onClick={() => void mutate(item, "status", { status: "contacted" })}
                        >
                          Reabrir
                        </button>
                        {data.canManage ? (
                          <button
                            type="button"
                            className={ownerUi.secondaryButton}
                            disabled={busy}
                            onClick={() => {
                              if (window.confirm("Se borrarán el nombre, el email, el teléfono y el comentario. No se puede deshacer.")) {
                                void mutate(item, "anonymize", {});
                              }
                            }}
                          >
                            Eliminar datos personales
                          </button>
                        ) : null}
                      </>
                    ) : null}
                    {item.status === "converted" && data.canManage ? (
                      <Link
                        className={ownerUi.secondaryButton}
                        href={`/owner/athletes?${new URLSearchParams({ organizationId }).toString()}`}
                      >
                        Asignar grupo en Gimnastas
                      </Link>
                    ) : null}
                  </div>

                  {convertingId === item.id && data.canManage ? (
                    <form
                      onSubmit={(event) => void onConvert(event, item)}
                      className={`${ownerUi.subtlePanel} mt-4 grid gap-4`}
                      aria-label={`Pasar a ${item.athleteGivenName} a inscripción`}
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
                      <p className={ownerUi.help}>
                        Se crean la ficha y la familia; no se crea ninguna inscripción ni cuota. La gimnasta queda en
                        Gimnastas para asignarle grupo. Añade a {item.contactName} y su contacto desde la ficha cuando
                        lo necesites.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button type="submit" className={ownerUi.primaryButton} disabled={busy}>
                          {busyId === item.id ? "Guardando…" : "Confirmar"}
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
