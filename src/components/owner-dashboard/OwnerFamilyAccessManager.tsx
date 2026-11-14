"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { familyRequest } from "@/components/family-portal/family-access-fetch";
import { ownerTone, ownerUi } from "@/components/owner-dashboard/owner-ui";
import {
  GUARDIAN_PORTAL_STATUS_LABELS,
  type GuardianPortalStatus,
} from "@/modules/family-access/domain/family-access-contract";

export type OwnerFamilyAccessGuardian = {
  guardianId: string;
  name: string;
  email: string | null;
  athletes: string[];
  status: GuardianPortalStatus;
  actions: { invite: boolean; resend: boolean; revoke: boolean; removeAccess: boolean };
  invitation: { id: string; revision: number; expiresAt: string; lastSentAt: string | null; grantViewAthletes: boolean } | null;
  linkedSince: string | null;
  canViewAthletes: boolean;
};

type CommandResult = {
  link: string | null;
  emailSent: boolean | null;
  counts?: { invited: number; emailed: number; skippedNoEmail: number; skippedExisting: number };
};

const STATUS_CHIP: Record<GuardianPortalStatus, string> = {
  linked: ownerTone.chipSuccess,
  pending: ownerUi.chipAccent,
  expired: ownerTone.chipWarning,
  revoked: ownerTone.chipOutline,
  removed: ownerTone.chipOutline,
  not_invited: ownerTone.chipOutline,
};

const dateFormat = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric" });

/**
 * Acceso de las familias al portal, tutor a tutor. Invitar exige confirmar el
 * correo en el mismo paso (un correo mal escrito es el riesgo principal) y
 * decidir si el tutor ve horario, asistencia y avisos de sus gimnastas.
 */
export function OwnerFamilyAccessManager({
  organizationId,
  locationId,
  guardians,
  truncated,
}: {
  organizationId: string;
  locationId: string;
  guardians: OwnerFamilyAccessGuardian[];
  truncated: boolean;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState<string | null>(null);
  const [grant, setGrant] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "info" | "error"; text: string } | null>(null);
  const [oneTimeLink, setOneTimeLink] = useState<{ name: string; link: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const invitable = useMemo(() => guardians.filter((guardian) => guardian.actions.invite), [guardians]);
  const withoutEmail = useMemo(() => guardians.filter((guardian) => !guardian.email).length, [guardians]);

  async function run(body: Record<string, unknown>, guardianName: string | null) {
    setBusy(true);
    setMessage(null);
    setOneTimeLink(null);
    setCopied(false);
    const result = await familyRequest<CommandResult>("/api/v1/owner/family-access", { organizationId, locationId, ...body });
    setBusy(false);
    setConfirming(null);
    if (!result.ok) {
      setMessage({ tone: "error", text: result.message });
      return;
    }
    const data = result.data;
    if (data.counts) {
      const { invited, emailed, skippedNoEmail, skippedExisting } = data.counts;
      setMessage({
        tone: "info",
        text: `Invitaciones creadas: ${invited}. Correos enviados: ${emailed}. Sin correo: ${skippedNoEmail}. Con acceso o invitación pendiente: ${skippedExisting}.`,
      });
    } else if (body.action === "invite" || body.action === "resend") {
      setMessage({
        tone: "info",
        text: data.emailSent
          ? "Invitación enviada por correo. También puedes copiar el enlace y compartirlo tú."
          : "No se pudo confirmar el envío del correo. Copia el enlace y compártelo con la familia.",
      });
      if (data.link && guardianName) setOneTimeLink({ name: guardianName, link: data.link });
    } else {
      setMessage({ tone: "info", text: body.action === "revoke" ? "Invitación revocada: el enlace ya no sirve." : "Acceso retirado: la cuenta ya no ve datos de esta academia." });
    }
    router.refresh();
  }

  async function copyLink() {
    if (!oneTimeLink) return;
    try {
      await navigator.clipboard.writeText(oneTimeLink.link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className={ownerUi.card} aria-labelledby="family-access-title">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 id="family-access-title" className={ownerUi.sectionTitle}>Acceso al portal</h2>
          <p className={`${ownerUi.muted} mt-2 max-w-2xl`}>
            Cada familia entra con su propia cuenta y solo ve a sus gimnastas. El enlace sirve una vez y caduca a los 7 días; solo lo puede aceptar una cuenta con el mismo correo, ya verificado.
          </p>
        </div>
        {invitable.length > 0 ? (
          <button type="button" className={ownerUi.secondaryButton} disabled={busy} onClick={() => setConfirming("__all__")}>
            Invitar a todas ({invitable.length})
          </button>
        ) : null}
      </div>

      {confirming === "__all__" ? (
        <div className={`${ownerUi.subtlePanel} mt-4`} role="group" aria-label="Confirmar invitación a todas las familias">
          <p className="text-sm text-z-ink">
            Se enviará un enlace a {invitable.length} {invitable.length === 1 ? "tutor" : "tutores"} con correo y sin acceso. Revisa antes que los correos son correctos.
          </p>
          <label className="mt-3 flex items-start gap-2 text-sm text-z-ink">
            <input type="checkbox" className="mt-1" checked={grant} onChange={(event) => setGrant(event.target.checked)} />
            Al aceptar, podrán ver el horario, la asistencia y los avisos de sus gimnastas.
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={ownerUi.primaryButton} disabled={busy} onClick={() => void run({ action: "invite_all", grantViewAthletes: grant }, null)}>
              {busy ? "Enviando…" : "Enviar invitaciones"}
            </button>
            <button type="button" className={ownerUi.secondaryButton} disabled={busy} onClick={() => setConfirming(null)}>Cancelar</button>
          </div>
        </div>
      ) : null}

      {message ? (
        <p role={message.tone === "error" ? "alert" : "status"} className={`${message.tone === "error" ? ownerUi.noticeError : ownerUi.noticeInfo} mt-4`}>
          {message.text}
        </p>
      ) : null}
      {oneTimeLink ? (
        <div className={`${ownerUi.subtlePanel} mt-3`}>
          <p className="text-sm text-z-ink">Enlace de un solo uso para {oneTimeLink.name}. No volverá a mostrarse.</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input readOnly aria-label="Enlace de invitación" className={`${ownerUi.field} sm:max-w-xl`} value={oneTimeLink.link} onFocus={(event) => event.currentTarget.select()} />
            <button type="button" className={ownerUi.secondaryButton} onClick={() => void copyLink()}>{copied ? "Copiado" : "Copiar"}</button>
          </div>
        </div>
      ) : null}
      {truncated ? <p className={`${ownerTone.warningText} mt-3`}>Se muestran los primeros 1.000 tutores.</p> : null}
      {withoutEmail > 0 ? (
        <p className={`${ownerUi.help} mt-3`}>
          {withoutEmail} {withoutEmail === 1 ? "tutor no tiene" : "tutores no tienen"} correo principal: añádelo desde la ficha de la gimnasta, en Contactos, para poder invitar.
        </p>
      ) : null}

      {guardians.length === 0 ? (
        <p className={`${ownerUi.muted} mt-5`}>Todavía no hay tutores con una familia activa. Asocia una familia desde la ficha de una gimnasta.</p>
      ) : (
        <ul className="mt-5 space-y-3">
          {guardians.map((guardian) => (
            <li key={guardian.guardianId} className={ownerUi.listItem}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-z-ink">{guardian.name}</p>
                  <p className={ownerUi.help}>
                    {guardian.athletes.length ? `Familia de ${guardian.athletes.join(", ")}` : "Sin gimnastas vigentes"}
                    {" · "}
                    {guardian.email ?? "Sin correo principal"}
                  </p>
                  <p className="mt-2 flex flex-wrap items-center gap-2">
                    <span className={STATUS_CHIP[guardian.status]}>{GUARDIAN_PORTAL_STATUS_LABELS[guardian.status]}</span>
                    {guardian.status === "linked" && guardian.linkedSince ? (
                      <span className={ownerUi.help}>desde el {dateFormat.format(new Date(guardian.linkedSince))}</span>
                    ) : null}
                    {(guardian.status === "pending" || guardian.status === "expired") && guardian.invitation ? (
                      <span className={ownerUi.help}>
                        {guardian.status === "pending" ? "caduca el" : "caducó el"} {dateFormat.format(new Date(guardian.invitation.expiresAt))}
                      </span>
                    ) : null}
                    {guardian.status === "linked" && !guardian.canViewAthletes ? (
                      <span className={ownerTone.chipWarning}>No ve horario ni recibe avisos</span>
                    ) : null}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {guardian.actions.invite ? (
                    <button type="button" className={ownerUi.secondaryButton} disabled={busy} onClick={() => { setGrant(true); setConfirming(guardian.guardianId); }}>
                      Invitar al portal
                    </button>
                  ) : null}
                  {guardian.actions.resend && guardian.invitation ? (
                    <button type="button" className={ownerUi.secondaryButton} disabled={busy}
                      onClick={() => void run({ action: "resend", invitationId: guardian.invitation!.id, revision: guardian.invitation!.revision }, guardian.name)}>
                      Reenviar
                    </button>
                  ) : null}
                  {guardian.actions.revoke && guardian.invitation ? (
                    <button type="button" className={ownerTone.dangerOutlineButton} disabled={busy}
                      onClick={() => void run({ action: "revoke", invitationId: guardian.invitation!.id, revision: guardian.invitation!.revision }, guardian.name)}>
                      Revocar
                    </button>
                  ) : null}
                  {guardian.actions.removeAccess ? (
                    <button type="button" className={ownerTone.dangerOutlineButton} disabled={busy}
                      onClick={() => {
                        if (window.confirm(`¿Retirar el acceso al portal de ${guardian.name}? Su cuenta dejará de ver datos de esta academia.`)) {
                          void run({ action: "remove_access", guardianId: guardian.guardianId }, guardian.name);
                        }
                      }}>
                      Retirar acceso
                    </button>
                  ) : null}
                </div>
              </div>
              {confirming === guardian.guardianId && guardian.email ? (
                <div className={`${ownerUi.subtlePanel} mt-3`} role="group" aria-label={`Confirmar invitación de ${guardian.name}`}>
                  <p className="text-sm text-z-ink">
                    Se enviará un enlace a <strong className="break-all">{guardian.email}</strong>. Comprueba que es el correo de {guardian.name}: quien lo abra con esa dirección podrá entrar.
                  </p>
                  <label className="mt-3 flex items-start gap-2 text-sm text-z-ink">
                    <input type="checkbox" className="mt-1" checked={grant} onChange={(event) => setGrant(event.target.checked)} />
                    Al aceptar, podrá ver el horario, la asistencia y los avisos de sus gimnastas.
                  </label>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" className={ownerUi.primaryButton} disabled={busy}
                      onClick={() => void run({ action: "invite", guardianId: guardian.guardianId, grantViewAthletes: grant }, guardian.name)}>
                      {busy ? "Enviando…" : "Enviar invitación"}
                    </button>
                    <button type="button" className={ownerUi.secondaryButton} disabled={busy} onClick={() => setConfirming(null)}>Cancelar</button>
                  </div>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
