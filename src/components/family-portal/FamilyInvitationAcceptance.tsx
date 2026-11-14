"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { InvitationPageShell } from "@/components/invitations/InvitationPageShell";
import { familyRequest } from "@/components/family-portal/family-access-fetch";
import { ownerUi } from "@/components/owner-dashboard/owner-ui";
import { captureFamilyInvitationFragment, takeFamilyInvitationToken } from "@/lib/auth/family-invitation-fragment";

type Inspection = { academyName: string; grantViewAthletes: boolean };
type Phase = "checking" | "missing" | "login" | "invalid" | "ready" | "accepted";

const GENERIC_ERROR =
  "No se pudo verificar esta invitación con tu sesión. Comprueba que has entrado con la cuenta del correo al que te invitaron y que ese correo está confirmado. Si el enlace ya no es válido, pide uno nuevo a tu academia.";

/**
 * Aceptación de la invitación al portal. Abrir el enlace no concede nada: se
 * revisa primero (academia y qué podrás ver) y se acepta con un botón.
 */
export function FamilyInvitationAcceptance() {
  const tokenRef = useRef<string | null | undefined>(undefined);
  const acceptingRef = useRef(false);
  const [phase, setPhase] = useState<Phase>("checking");
  const [inspected, setInspected] = useState<Inspection | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    captureFamilyInvitationFragment();
    if (tokenRef.current === undefined) tokenRef.current = takeFamilyInvitationToken();
    const token = tokenRef.current;
    if (!token) {
      setPhase("missing");
      return;
    }
    setPhase("checking");
    setError("");
    let active = true;
    void (async () => {
      const result = await familyRequest<Inspection>("/api/v1/family/invitations/inspect", { token });
      if (!active) return;
      if (!result.ok) {
        if (result.status === 401) setPhase("login");
        else {
          setPhase("invalid");
          setError(result.status === 503 ? result.message : GENERIC_ERROR);
        }
        return;
      }
      setInspected(result.data);
      setPhase("ready");
    })();
    return () => {
      active = false;
    };
  }, [attempt]);

  async function accept() {
    if (acceptingRef.current || !tokenRef.current || phase !== "ready") return;
    acceptingRef.current = true;
    setBusy(true);
    setError("");
    const result = await familyRequest<{ academyName: string }>("/api/v1/family/invitations/accept", { token: tokenRef.current });
    acceptingRef.current = false;
    setBusy(false);
    if (!result.ok) {
      if (result.status === 401) {
        setPhase("login");
        return;
      }
      setError(result.status === 0 ? "No se pudo confirmar el resultado. Vuelve a pulsar el botón: aceptar dos veces no duplica nada." : GENERIC_ERROR);
      if (result.status !== 0) setPhase("invalid");
      return;
    }
    tokenRef.current = null;
    setPhase("accepted");
  }

  return (
    <InvitationPageShell
      eyebrow="Portal de familias"
      title="Invitación de tu academia"
      description="Revisa la academia antes de aceptar. Abrir este enlace no comparte ningún dato."
      form={
        <>
          {phase === "checking" ? <p role="status" className={ownerUi.muted}>Comprobando invitación…</p> : null}
          {phase === "missing" ? (
            <p role="status" className={ownerUi.noticeInfo}>
              Abre el enlace original del correo de invitación. Si acabas de iniciar sesión o de crear la cuenta, vuelve a abrir ese enlace. Si ya no lo tienes, pide a tu academia que te lo reenvíe.
            </p>
          ) : null}
          {phase === "login" ? (
            <section aria-labelledby="family-invitation-login">
              <h2 id="family-invitation-login" className={ownerUi.cardTitle}>Entra con tu cuenta</h2>
              <p className={`${ownerUi.muted} mt-3`}>
                Usa el mismo correo al que te ha llegado la invitación y confírmalo. Se abre en otra pestaña: no cierres esta, porque la invitación sigue aquí.
              </p>
              <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <Link href="/auth/login" prefetch={false} target="_blank" rel="noopener noreferrer" className={ownerUi.primaryButton}>Iniciar sesión</Link>
                <Link href="/auth/register" prefetch={false} target="_blank" rel="noopener noreferrer" className={ownerUi.secondaryButton}>Crear una cuenta con ese correo</Link>
              </div>
              <p className={`${ownerUi.help} mt-4`}>Cuando hayas entrado en la otra pestaña, vuelve aquí.</p>
              <button type="button" className={`${ownerUi.secondaryButton} mt-2`} onClick={() => setAttempt((current) => current + 1)}>
                Ya he entrado: comprobar la invitación
              </button>
              <p className={`${ownerUi.help} mt-3`}>Si cierras esta pestaña, vuelve a abrir el enlace del correo.</p>
            </section>
          ) : null}
          {error ? <p role="alert" className={`${ownerUi.noticeError} mt-4`}>{error}</p> : null}
          {inspected && phase === "ready" ? (
            <section aria-labelledby="family-invitation-summary">
              <h2 id="family-invitation-summary" className={ownerUi.cardTitle}>{inspected.academyName}</h2>
              <p className={`${ownerUi.muted} mt-3`}>
                {inspected.grantViewAthletes
                  ? "Al aceptar, tu cuenta queda vinculada a tu ficha en la academia y podrás ver el horario, la asistencia, las cuotas que pagues y los avisos de tus gimnastas."
                  : "Al aceptar, tu cuenta queda vinculada a tu ficha en la academia. La academia decidirá después si ves el horario y la asistencia de tus gimnastas."}
              </p>
              <p className={`${ownerUi.help} mt-2`}>Solo verás lo de tu familia. El enlace sirve una vez.</p>
              <button type="button" className={`${ownerUi.primaryButton} mt-5`} disabled={busy} onClick={() => void accept()}>
                {busy ? "Confirmando…" : "Aceptar invitación"}
              </button>
            </section>
          ) : null}
          {phase === "accepted" ? (
            <section role="status" className={ownerUi.noticeInfo}>
              <p className="font-semibold">Invitación aceptada.</p>
              <p className="mt-1">Ya puedes entrar al portal de familias.</p>
              <Link href="/familia" prefetch={false} className={`${ownerUi.primaryButton} mt-4`}>Ir al portal</Link>
            </section>
          ) : null}
        </>
      }
    />
  );
}
