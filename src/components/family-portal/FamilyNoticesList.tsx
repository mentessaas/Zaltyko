"use client";

import { useEffect, useRef, useState } from "react";

import { familyRequest } from "@/components/family-portal/family-access-fetch";
import { ownerTone, ownerUi } from "@/components/owner-dashboard/owner-ui";
import { FAMILY_NOTICE_KIND_LABELS, type FamilyNoticeKind } from "@/modules/family-access/domain/family-access-contract";

export type FamilyNoticesAcademyView = {
  organizationId: string;
  organizationName: string;
  preferences: { emailSessionChanges: boolean; emailManualNotices: boolean };
  notices: Array<{ id: string; kind: FamilyNoticeKind; title: string; body: string; createdAt: string; readAt: string | null }>;
};

const dateTime = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

function Preferences({ academy }: { academy: FamilyNoticesAcademyView }) {
  const [sessionChanges, setSessionChanges] = useState(academy.preferences.emailSessionChanges);
  const [manualNotices, setManualNotices] = useState(academy.preferences.emailManualNotices);
  const [status, setStatus] = useState<{ tone: "info" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(next: { emailSessionChanges: boolean; emailManualNotices: boolean }) {
    setBusy(true);
    setStatus(null);
    const result = await familyRequest("/api/v1/family/notification-preferences", { organizationId: academy.organizationId, ...next }, { method: "PUT" });
    setBusy(false);
    if (!result.ok) {
      setSessionChanges(academy.preferences.emailSessionChanges);
      setManualNotices(academy.preferences.emailManualNotices);
      setStatus({ tone: "error", text: result.message });
      return;
    }
    setStatus({ tone: "info", text: "Preferencias guardadas." });
  }

  return (
    <fieldset className={`${ownerUi.subtlePanel} mt-4`} disabled={busy}>
      <legend className="sr-only">Correos de {academy.organizationName}</legend>
      <p className={ownerUi.smallLabel}>Recibir también por correo</p>
      <label className="mt-2 flex items-center gap-2 text-sm text-z-ink">
        <input type="checkbox" checked={sessionChanges} onChange={(event) => {
          setSessionChanges(event.target.checked);
          void save({ emailSessionChanges: event.target.checked, emailManualNotices: manualNotices });
        }} />
        Cambios y cancelaciones de sesiones
      </label>
      <label className="mt-2 flex items-center gap-2 text-sm text-z-ink">
        <input type="checkbox" checked={manualNotices} onChange={(event) => {
          setManualNotices(event.target.checked);
          void save({ emailSessionChanges: sessionChanges, emailManualNotices: event.target.checked });
        }} />
        Mensajes de la academia
      </label>
      <p className={`${ownerUi.help} mt-2`}>Los avisos siempre quedan aquí, en el portal.</p>
      {status ? <p role={status.tone === "error" ? "alert" : "status"} className={`${status.tone === "error" ? ownerTone.errorText : ownerUi.help} mt-2`}>{status.text}</p> : null}
    </fieldset>
  );
}

/**
 * Lista de avisos por academia. Al abrir la página, los avisos sin leer se
 * marcan como leídos (la academia ve quién los ha leído); siguen destacados
 * como «Nuevo» hasta la próxima visita.
 */
export function FamilyNoticesList({ academies }: { academies: FamilyNoticesAcademyView[] }) {
  const marked = useRef(false);
  useEffect(() => {
    if (marked.current) return;
    marked.current = true;
    const unread = academies.flatMap((academy) => academy.notices.filter((notice) => !notice.readAt).map((notice) => notice.id)).slice(0, 50);
    if (unread.length) void familyRequest("/api/v1/family/notices/read", { noticeIds: unread });
  }, [academies]);

  return (
    <div className="space-y-6">
      {academies.map((academy) => (
        <section key={academy.organizationId} className={ownerUi.card} aria-labelledby={`notices-${academy.organizationId}`}>
          <h2 id={`notices-${academy.organizationId}`} className={ownerUi.sectionTitle}>{academy.organizationName}</h2>
          {academy.notices.length === 0 ? (
            <p className={`${ownerUi.muted} mt-3`}>No hay avisos todavía.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {academy.notices.map((notice) => (
                <li key={notice.id} className={ownerUi.listItem}>
                  <p className="flex flex-wrap items-center gap-2">
                    <span className={ownerUi.chip}>{FAMILY_NOTICE_KIND_LABELS[notice.kind]}</span>
                    {!notice.readAt ? <span className={ownerUi.chipAccent}>Nuevo</span> : null}
                    <span className={ownerUi.help}>{dateTime.format(new Date(notice.createdAt))}</span>
                  </p>
                  <p className="mt-2 font-semibold text-z-ink">{notice.title}</p>
                  <p className="mt-1 whitespace-pre-line text-sm text-z-soft">{notice.body}</p>
                </li>
              ))}
            </ul>
          )}
          <Preferences academy={academy} />
        </section>
      ))}
    </div>
  );
}
