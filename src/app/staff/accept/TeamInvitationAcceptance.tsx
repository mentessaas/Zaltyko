"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { InvitationPageShell } from "@/components/invitations/InvitationPageShell";
import { captureTeamInvitationFragment, takeTeamInvitationToken } from "@/lib/auth/team-invitation-fragment";
import type {
  TeamInvitationAcceptance as TeamInvitationAcceptanceResult,
  TeamInvitationInspection,
} from "@/modules/staff/domain/team-access-contract";

// «Magnesio sobre tapiz»: principal en azul tapiz con canto de 1 px (hover a
// zona de seguridad), contorno blanco con borde de rampa, avisos en polvo de
// magnesio y solo los errores en coral tinta. Antes: botones cuadrados en
// noche y avisos en ámbar, que el tema pinta con el mismo coral que un error.
const FOCUS = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mat";
const BUTTON = `inline-flex min-h-11 items-center justify-center rounded-md bg-mat px-6 py-2.5 text-sm font-semibold text-white shadow-[0_1px_0_rgba(11,20,48,0.25)] transition-colors hover:bg-mat-deep ${FOCUS} disabled:cursor-not-allowed disabled:opacity-50`;
const OUTLINE_BUTTON = `inline-flex min-h-11 items-center justify-center rounded-md border border-ramp-300 bg-white px-6 py-2.5 text-sm font-semibold text-mat-night transition-colors hover:border-mat hover:text-mat ${FOCUS} disabled:cursor-not-allowed disabled:opacity-50`;
const NOTICE = "rounded-[10px] border border-chalk-line bg-chalk-dust p-4 text-sm leading-6 text-mat-night";
const ERROR = "rounded-[10px] border border-signal/30 bg-signal-wash p-4 text-sm leading-6 text-signal-ink";
const PANEL_TITLE = "font-display text-2xl font-black uppercase leading-none text-mat-night";
const GENERIC_ERROR = "No se pudo verificar esta invitación con tu sesión. Comprueba que has iniciado sesión y confirmado el correo al que te invitaron. Si el enlace ya no es válido, pide a la dirección de la academia que lo reemita.";

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function inspection(value: unknown): value is TeamInvitationInspection {
  return record(value) && record(value.organization) && typeof value.organization.id === "string"
    && typeof value.organization.name === "string" && (value.role === "manager" || value.role === "coach")
    && Array.isArray(value.locations) && value.locations.length > 0
    && value.locations.every(location => record(location) && typeof location.id === "string" && typeof location.name === "string")
    && (value.joinable === undefined || typeof value.joinable === "boolean");
}

function acceptance(value: unknown, inspected: TeamInvitationInspection): value is TeamInvitationAcceptanceResult {
  if (!record(value) || typeof value.replayed !== "boolean" || !record(value.membership)) return false;
  const member = value.membership;
  return typeof member.id === "string" && member.status === "active" && member.role === inspected.role
    && member.locationScopeMode === "selected" && Array.isArray(member.locations)
    && member.locations.every(location => record(location) && typeof location.id === "string" && typeof location.name === "string")
    && member.locations.map(location => location.id).sort().join(",") === inspected.locations.map(location => location.id).sort().join(",");
}

export function TeamInvitationAcceptance() {
  // Only this mounted page owns the credential. StrictMode effect replay reuses
  // the ref and never consumes the one-shot fragment helper a second time.
  const tokenRef = useRef<string | null | undefined>(undefined);
  const acceptKeyRef = useRef<string | null>(null);
  const acceptingRef = useRef(false);
  const [phase, setPhase] = useState<"checking" | "missing" | "login" | "invalid" | "ready" | "uncertain" | "accepted">("checking");
  const [inspected, setInspected] = useState<TeamInvitationInspection | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [inspectionAttempt, setInspectionAttempt] = useState(0);

  useEffect(() => {
    // Instrumentation also captures before telemetry. No Auth/analytics SDK is
    // imported by this page; the direct request uses the existing session cookie.
    captureTeamInvitationFragment();
    if (tokenRef.current === undefined) tokenRef.current = takeTeamInvitationToken();
    const token = tokenRef.current;
    if (!token) {
      setPhase("missing");
      return;
    }
    const controller = new AbortController();
    let active = true;
    setPhase("checking");
    setError("");
    setInspected(null);
    void (async () => {
      try {
        const response = await fetch("/api/v1/staff/invitations/inspect", {
          method: "POST", cache: "no-store", credentials: "same-origin", referrerPolicy: "no-referrer",
          headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }), signal: controller.signal,
        });
        if (!active) return;
        if (response.status === 401) {
          setPhase("login");
          return;
        }
        const payload: unknown = await response.json();
        if (!active) return;
        if (response.status !== 200 || !record(payload) || payload.ok !== true || !inspection(payload.data)) {
          setPhase("invalid");
          setError(GENERIC_ERROR);
          return;
        }
        setInspected(payload.data);
        setPhase("ready");
      } catch {
        if (active) {
          setPhase("invalid");
          setError("No se pudo comprobar la invitación. Puedes volver a comprobarla; esta lectura no concede acceso.");
        }
      }
    })();
    return () => { active = false; controller.abort(); };
  }, [inspectionAttempt]);

  async function accept() {
    if (acceptingRef.current || !inspected || !tokenRef.current || (phase !== "ready" && phase !== "uncertain")) return;
    if (!acceptKeyRef.current) {
      try { acceptKeyRef.current = window.crypto.randomUUID(); } catch {
        setError("No se pudo preparar una clave segura. No se ha enviado la aceptación.");
        return;
      }
    }
    acceptingRef.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/v1/staff/invitations/accept", {
        method: "POST", cache: "no-store", credentials: "same-origin", referrerPolicy: "no-referrer",
        headers: { "Content-Type": "application/json", "Idempotency-Key": acceptKeyRef.current },
        body: JSON.stringify({ token: tokenRef.current }),
      });
      if (response.status === 401) {
        setPhase("login");
        return;
      }
      const payload: unknown = await response.json();
      if (response.status >= 500) throw new Error("UNCERTAIN_ACCEPTANCE");
      if (response.status >= 200 && response.status < 300 && (!record(payload) || payload.ok !== true)) {
        throw new Error("UNCONFIRMED_ACCEPTANCE");
      }
      if (response.status < 200 || response.status >= 300) {
        setPhase("invalid");
        setInspected(null);
        setError(GENERIC_ERROR);
        return;
      }
      if (!record(payload) || !acceptance(payload.data, inspected)) throw new Error("UNCONFIRMED_ACCEPTANCE");
      tokenRef.current = null;
      acceptKeyRef.current = null;
      setPhase("accepted");
    } catch {
      setPhase("uncertain");
      setError("No se pudo confirmar el resultado. Reintenta la misma aceptación desde este botón; se conserva su clave original solo mientras esta página siga abierta.");
    } finally {
      acceptingRef.current = false;
      setBusy(false);
    }
  }

  return (
    <InvitationPageShell
      eyebrow="Invitación de equipo"
      title="Invitación a una academia"
      description="Revisa la academia, el rol y las sedes antes de aceptar. Abrir este enlace no concede acceso."
      form={<>
        {phase === "checking" ? <p role="status" className="text-sm text-ramp-600">Comprobando invitación…</p> : null}
        {phase === "missing" ? <p role="status" className={NOTICE}>Abre el enlace original de la invitación. Si acabas de iniciar sesión, vuelve a abrir ese enlace para revisarla. Si ya no lo tienes, pide a la dirección de la academia que lo reemita.</p> : null}
        {phase === "login" ? <section aria-labelledby="invitation-login-title">
          <h2 id="invitation-login-title" className={PANEL_TITLE}>Inicia sesión para revisarla</h2>
          <p className="mt-3 text-sm leading-6 text-ramp-600">Usa la cuenta con el correo al que te invitaron y confirma ese correo. Después de iniciar sesión, vuelve a abrir el enlace original. La invitación no se acepta automáticamente.</p>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Link href="/auth/login" prefetch={false} className={BUTTON}>Iniciar sesión</Link>
            <Link href="/auth/register" prefetch={false} className={OUTLINE_BUTTON}>Crear una cuenta con ese correo</Link>
          </div>
        </section> : null}
        {error ? <p role="alert" className={ERROR}>{error}</p> : null}
        {phase === "invalid" ? <button type="button" className={`${BUTTON} mt-4`} onClick={() => setInspectionAttempt(current => current + 1)}>Volver a comprobar invitación</button> : null}
        {inspected && (phase === "ready" || phase === "uncertain") ? <section className={error ? "mt-6" : ""} aria-labelledby="invitation-summary-title">
          <h2 id="invitation-summary-title" className={PANEL_TITLE}>Revisa el acceso solicitado</h2>
          <dl className="mt-4 border-t-[3px] border-mat-night text-sm">
            <div className="flex flex-col gap-1 border-b border-chalk-line py-4 sm:flex-row sm:gap-6"><dt className="floor-label w-24 shrink-0 pt-0.5 text-ramp-500">Academia</dt><dd className="font-semibold text-mat-night">{inspected.organization.name}</dd></div>
            <div className="flex flex-col gap-1 border-b border-chalk-line py-4 sm:flex-row sm:gap-6"><dt className="floor-label w-24 shrink-0 pt-0.5 text-ramp-500">Rol</dt><dd className="font-semibold text-mat-night">{inspected.role === "coach" ? "Entrenador/a" : "Coordinador/a"}</dd></div>
            <div className="flex flex-col gap-1 border-b border-chalk-line py-4 sm:flex-row sm:gap-6"><dt className="floor-label w-24 shrink-0 pt-0.5 text-ramp-500">Sedes</dt><dd className="font-semibold text-mat-night"><ul className="space-y-1">{inspected.locations.map(location => <li key={location.id}>{location.name}</li>)}</ul></dd></div>
          </dl>
          <p className="mt-4 text-sm leading-6 text-ramp-600">Al aceptar se crea tu acceso a estas sedes y tu cuenta queda vinculada a tu ficha del equipo de la academia. El enlace solo sirve una vez.</p>
          {inspected.joinable === false ? <p role="alert" className={`${NOTICE} mt-4`}>La academia no puede incorporar a nadie al equipo ahora mismo. Consulta a la dirección de la academia antes de aceptar; el enlace seguirá siendo válido hasta que caduque.</p> : null}
          <button type="button" className={`${BUTTON} mt-5 w-full sm:w-auto`} disabled={busy || inspected.joinable === false} onClick={() => void accept()}>{busy ? "Confirmando…" : phase === "uncertain" ? "Reintentar la misma aceptación" : "Aceptar invitación"}</button>
        </section> : null}
        {phase === "accepted" ? <section role="status" className="rounded-[10px] border border-mat/30 bg-mat-wash p-5">
          <h2 className={PANEL_TITLE}>Invitación aceptada</h2>
          <p className="mt-3 text-sm leading-6 text-mat-night">Ya formas parte del equipo de {inspected?.organization.name} en las sedes revisadas, con tu ficha del equipo vinculada. Las clases que te asigne la dirección aparecerán en tu panel.</p>
          <Link href="/owner" prefetch={false} className={`${BUTTON} mt-4`}>Ir a mi panel</Link>
        </section> : null}
      </>}
    />
  );
}
