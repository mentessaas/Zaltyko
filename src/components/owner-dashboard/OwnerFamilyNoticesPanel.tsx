"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { familyRequest } from "@/components/family-portal/family-access-fetch";
import { ownerTone, ownerUi } from "@/components/owner-dashboard/owner-ui";
import {
  FAMILY_NOTICE_KIND_LABELS,
  utcToZonedWallTime,
  zonedWallTimeToUtc,
  type FamilyNoticeKind,
} from "@/modules/family-access/domain/family-access-contract";

type EmailStatus = "pending" | "sent" | "failed" | "skipped_preference" | "skipped_no_account";

export type OwnerFamilyNoticesBundle = {
  notices: Array<{
    id: string;
    kind: FamilyNoticeKind;
    title: string;
    body: string;
    createdAt: string;
    locationName: string;
    targetName: string | null;
    recipients: Array<{ guardianName: string; readAt: string | null; emailStatus: EmailStatus }>;
  }>;
  classes: Array<{ id: string; name: string; locationId: string; locationName: string }>;
  groups: Array<{ id: string; name: string; locationId: string; locationName: string }>;
  upcomingSessions: Array<{ id: string; className: string; locationName: string; timezone: string; startsAt: string; endsAt: string; locationId: string }>;
};

type Upcoming = OwnerFamilyNoticesBundle["upcomingSessions"][number];

const EMAIL_LABELS: Record<EmailStatus, string> = {
  pending: "correo pendiente",
  sent: "correo enviado",
  failed: "correo no enviado",
  skipped_preference: "sin correo (lo desactivó)",
  skipped_no_account: "sin acceso al portal",
};

const dateTime = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function sessionLabel(session: Upcoming): string {
  const day = new Intl.DateTimeFormat("es-ES", { weekday: "short", day: "numeric", month: "short", timeZone: session.timezone }).format(new Date(session.startsAt));
  const time = new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: session.timezone });
  return `${day} · ${time.format(new Date(session.startsAt))}–${time.format(new Date(session.endsAt))}`;
}

function SessionChangeForm({ organizationId, session, onDone }: { organizationId: string; session: Upcoming; onDone: (text: string, tone: "info" | "error") => void }) {
  const start = utcToZonedWallTime(new Date(session.startsAt), session.timezone);
  const end = utcToZonedWallTime(new Date(session.endsAt), session.timezone);
  const [mode, setMode] = useState<"cancel" | "reschedule">("cancel");
  const [date, setDate] = useState(start.date);
  const [startTime, setStartTime] = useState(start.time);
  const [endTime, setEndTime] = useState(end.time);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    const base = { organizationId, locationId: session.locationId, reason: reason.trim() || null };
    let body: Record<string, unknown>;
    if (mode === "cancel") {
      body = { ...base, action: "cancel" };
    } else {
      const startsAt = zonedWallTimeToUtc(date, startTime, session.timezone);
      const endsAt = zonedWallTimeToUtc(date, endTime, session.timezone);
      if (!startsAt || !endsAt || endsAt <= startsAt) {
        setError("Revisa la fecha y las horas: la hora de fin debe ser posterior a la de inicio.");
        return;
      }
      body = { ...base, action: "reschedule", startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() };
    }
    setBusy(true);
    const result = await familyRequest<{ recipients: number }>(`/api/v1/owner/sessions/${session.id}/change`, body);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    onDone(
      `${mode === "cancel" ? "Sesión cancelada" : "Horario cambiado"}. Aviso para ${result.data.recipients} ${result.data.recipients === 1 ? "familia" : "familias"}.`,
      "info"
    );
  }

  return (
    <form onSubmit={(event) => void submit(event)} className={`${ownerUi.subtlePanel} mt-3 space-y-3`}>
      <fieldset className="flex flex-wrap gap-4 text-sm text-z-ink">
        <legend className="sr-only">Qué cambia</legend>
        <label className="flex items-center gap-2"><input type="radio" name={`mode-${session.id}`} checked={mode === "cancel"} onChange={() => setMode("cancel")} />Cancelar</label>
        <label className="flex items-center gap-2"><input type="radio" name={`mode-${session.id}`} checked={mode === "reschedule"} onChange={() => setMode("reschedule")} />Cambiar horario</label>
      </fieldset>
      {mode === "reschedule" ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <label className={ownerUi.label}>Día<input type="date" className={`${ownerUi.field} mt-1`} value={date} onChange={(event) => setDate(event.target.value)} required /></label>
          <label className={ownerUi.label}>Empieza<input type="time" className={`${ownerUi.field} mt-1`} value={startTime} onChange={(event) => setStartTime(event.target.value)} required /></label>
          <label className={ownerUi.label}>Termina<input type="time" className={`${ownerUi.field} mt-1`} value={endTime} onChange={(event) => setEndTime(event.target.value)} required /></label>
        </div>
      ) : null}
      <label className={`${ownerUi.label} block`}>
        Motivo para las familias (opcional)
        <input className={`${ownerUi.field} mt-1`} maxLength={300} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Por ejemplo: competición del club" />
      </label>
      <p className={ownerUi.help}>Hora de {session.locationName}. Las familias de las gimnastas inscritas lo verán en el portal y por correo, si no lo han desactivado. No se nombra a ninguna gimnasta.</p>
      {error ? <p role="alert" className={ownerTone.errorText}>{error}</p> : null}
      <button type="submit" className={mode === "cancel" ? ownerTone.dangerButton : ownerUi.primaryButton} disabled={busy}>
        {busy ? "Guardando…" : mode === "cancel" ? "Cancelar la sesión y avisar" : "Cambiar el horario y avisar"}
      </button>
    </form>
  );
}

/**
 * Avisos a familias: manual a una clase o grupo, y cancelación o cambio de
 * horario de una sesión próxima. Debajo, quién ha leído cada aviso.
 */
export function OwnerFamilyNoticesPanel({ organizationId, bundle }: { organizationId: string; bundle: OwnerFamilyNoticesBundle }) {
  const router = useRouter();
  const [message, setMessage] = useState<{ tone: "info" | "error"; text: string } | null>(null);
  const [openSession, setOpenSession] = useState<string | null>(null);
  const [target, setTarget] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  function done(text: string, tone: "info" | "error") {
    setMessage({ tone, text });
    setOpenSession(null);
    router.refresh();
  }

  async function sendManual(event: FormEvent) {
    event.preventDefault();
    const [kind, id] = target.split(":");
    if (!id || (kind !== "class" && kind !== "group")) {
      setMessage({ tone: "error", text: "Elige una clase o un grupo." });
      return;
    }
    const chosen = kind === "class" ? bundle.classes.find((item) => item.id === id) : bundle.groups.find((item) => item.id === id);
    if (!chosen) return;
    setBusy(true);
    setMessage(null);
    const result = await familyRequest<{ recipients: number }>("/api/v1/owner/family-notices", {
      organizationId,
      // El servidor comprueba que es la sede de la clase o del grupo.
      locationId: chosen.locationId,
      target: kind === "class" ? { kind: "class", classTemplateId: id } : { kind: "group", groupId: id },
      title,
      body,
    });
    setBusy(false);
    if (!result.ok) {
      setMessage({ tone: "error", text: result.message });
      return;
    }
    setTitle("");
    setBody("");
    setTarget("");
    done(`Aviso enviado a ${result.data.recipients} ${result.data.recipients === 1 ? "familia" : "familias"}.`, "info");
  }

  return (
    <section className={ownerUi.card} aria-labelledby="family-notices-title">
      <h2 id="family-notices-title" className={ownerUi.sectionTitle}>Avisos a familias</h2>
      <p className={`${ownerUi.muted} mt-2 max-w-2xl`}>
        Llegan a las familias con acceso al portal y permiso para ver a sus gimnastas: en el portal siempre y por correo según su preferencia. Cada aviso se envía una sola vez aunque repitas la acción.
      </p>
      {message ? (
        <p role={message.tone === "error" ? "alert" : "status"} className={`${message.tone === "error" ? ownerUi.noticeError : ownerUi.noticeInfo} mt-4`}>{message.text}</p>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <form onSubmit={(event) => void sendManual(event)} className="space-y-3" aria-labelledby="manual-notice-title">
          <h3 id="manual-notice-title" className="font-semibold text-z-ink">Escribir un aviso</h3>
          <label className={`${ownerUi.label} block`}>
            Para
            <select className={`${ownerUi.field} mt-1`} value={target} onChange={(event) => setTarget(event.target.value)} required>
              <option value="">Elige una clase o un grupo</option>
              {bundle.classes.length ? (
                <optgroup label="Clases">
                  {bundle.classes.map((item) => <option key={item.id} value={`class:${item.id}`}>{item.name} · {item.locationName}</option>)}
                </optgroup>
              ) : null}
              {bundle.groups.length ? (
                <optgroup label="Grupos">
                  {bundle.groups.map((item) => <option key={item.id} value={`group:${item.id}`}>{item.name} · {item.locationName}</option>)}
                </optgroup>
              ) : null}
            </select>
          </label>
          <label className={`${ownerUi.label} block`}>
            Título
            <input className={`${ownerUi.field} mt-1`} maxLength={140} value={title} onChange={(event) => setTitle(event.target.value)} required />
          </label>
          <label className={`${ownerUi.label} block`}>
            Mensaje
            <textarea className={`${ownerUi.field} mt-1 min-h-28 py-2`} maxLength={2000} value={body} onChange={(event) => setBody(event.target.value)} required />
          </label>
          <p className={ownerUi.help}>No escribas datos de salud ni de otras familias: el aviso lo leen todas las familias de la clase o el grupo.</p>
          <button type="submit" className={ownerUi.primaryButton} disabled={busy}>{busy ? "Enviando…" : "Enviar aviso"}</button>
        </form>

        <div aria-labelledby="upcoming-sessions-title">
          <h3 id="upcoming-sessions-title" className="font-semibold text-z-ink">Próximas sesiones (14 días)</h3>
          {bundle.upcomingSessions.length === 0 ? (
            <p className={`${ownerUi.muted} mt-2`}>No hay sesiones programadas en los próximos 14 días.</p>
          ) : (
            <ul className="mt-3 max-h-[28rem] space-y-2 overflow-y-auto pr-1">
              {bundle.upcomingSessions.map((session) => (
                <li key={session.id} className={ownerUi.listItem}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-z-ink">{session.className}</p>
                      <p className={ownerUi.help}>{sessionLabel(session)} · {session.locationName}</p>
                    </div>
                    <button type="button" className={ownerUi.secondaryButton} aria-expanded={openSession === session.id}
                      onClick={() => setOpenSession((current) => (current === session.id ? null : session.id))}>
                      {openSession === session.id ? "Cerrar" : "Cancelar o cambiar"}
                    </button>
                  </div>
                  {openSession === session.id ? <SessionChangeForm organizationId={organizationId} session={session} onDone={done} /> : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="mt-8">
        <h3 className="font-semibold text-z-ink">Enviados</h3>
        {bundle.notices.length === 0 ? (
          <p className={`${ownerUi.muted} mt-2`}>Todavía no se ha enviado ningún aviso.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {bundle.notices.map((notice) => {
              const read = notice.recipients.filter((recipient) => recipient.readAt).length;
              return (
                <li key={notice.id} className={ownerUi.listItem}>
                  <p className="flex flex-wrap items-center gap-2">
                    <span className={ownerUi.chip}>{FAMILY_NOTICE_KIND_LABELS[notice.kind]}</span>
                    <span className={ownerUi.help}>{dateTime.format(new Date(notice.createdAt))} · {notice.targetName ?? ""} · {notice.locationName}</span>
                  </p>
                  <p className="mt-2 font-semibold text-z-ink">{notice.title}</p>
                  <p className="mt-1 whitespace-pre-line text-sm text-z-soft">{notice.body}</p>
                  <details className="mt-3">
                    <summary className="cursor-pointer text-sm font-semibold text-z-ink">
                      Leído por {read} de {notice.recipients.length}
                    </summary>
                    {notice.recipients.length === 0 ? (
                      <p className={`${ownerUi.help} mt-2`}>Ninguna familia con acceso y permiso de ver gimnastas en ese grupo todavía. Invítalas arriba.</p>
                    ) : (
                      <ul className="mt-2 space-y-1 text-sm">
                        {notice.recipients.map((recipient, index) => (
                          <li key={`${notice.id}-${index}`} className="flex flex-wrap gap-x-2">
                            <span className="text-z-ink">{recipient.guardianName}</span>
                            <span className={ownerUi.help}>
                              {recipient.readAt ? `leído ${dateTime.format(new Date(recipient.readAt))}` : "sin leer"} · {EMAIL_LABELS[recipient.emailStatus]}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
