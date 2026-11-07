"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { captureTeamInvitationFragment, takeTeamInvitationToken } from "@/lib/auth/team-invitation-fragment";
import type {
  TeamInvitationAcceptance as TeamInvitationAcceptanceResult,
  TeamInvitationInspection,
} from "@/modules/staff/domain/team-access-contract";

const BUTTON = "inline-flex min-h-11 items-center justify-center border border-slate-950 bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800 disabled:cursor-not-allowed disabled:opacity-55";
const GENERIC_ERROR = "No se pudo verificar esta invitación con tu sesión. Comprueba que has iniciado sesión y confirmado el correo al que te invitaron. Si el enlace ya no es válido, pide al Owner que lo reemita.";

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function inspection(value: unknown): value is TeamInvitationInspection {
  return record(value) && record(value.organization) && typeof value.organization.id === "string"
    && typeof value.organization.name === "string" && (value.role === "manager" || value.role === "coach")
    && Array.isArray(value.locations) && value.locations.length > 0
    && value.locations.every(location => record(location) && typeof location.id === "string" && typeof location.name === "string");
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
    <main className="mx-auto w-full max-w-2xl px-5 py-10 text-slate-950 [overflow-wrap:anywhere] sm:py-16">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-teal-900">Zaltyko · Equipo</p>
      <h1 className="mt-3 font-display text-3xl font-bold">Invitación a una academia</h1>
      <p className="mt-3 text-sm leading-6 text-slate-700">Revisa la organización, el rol y las sedes antes de aceptar. Abrir este enlace no concede acceso.</p>
      {phase === "checking" ? <p role="status" className="mt-6 text-sm">Comprobando invitación…</p> : null}
      {phase === "missing" ? <p role="status" className="mt-6 border border-amber-700 bg-amber-50 p-4 text-sm leading-6">Abre el enlace original de la invitación. Si acabas de iniciar sesión, vuelve a abrir ese enlace para revisarla. Si ya no lo tienes, pide al Owner que lo reemita.</p> : null}
      {phase === "login" ? <section className="mt-6 border border-slate-300 p-5" aria-labelledby="invitation-login-title">
        <h2 id="invitation-login-title" className="text-lg font-bold">Inicia sesión para revisarla</h2>
        <p className="mt-2 text-sm leading-6">Usa la cuenta con el correo al que te invitaron y confirma ese correo. Después de iniciar sesión, vuelve a abrir el enlace original. La invitación no se acepta automáticamente.</p>
        <Link href="/auth/login" prefetch={false} className={`${BUTTON} mt-4`}>Iniciar sesión</Link>
      </section> : null}
      {error ? <p role="alert" className="mt-6 border border-amber-700 bg-amber-50 p-4 text-sm leading-6">{error}</p> : null}
      {phase === "invalid" ? <button type="button" className={`${BUTTON} mt-4`} onClick={() => setInspectionAttempt(current => current + 1)}>Volver a comprobar invitación</button> : null}
      {inspected && (phase === "ready" || phase === "uncertain") ? <section className="mt-6 border border-slate-300 bg-white p-5" aria-labelledby="invitation-summary-title">
        <h2 id="invitation-summary-title" className="text-xl font-bold">Revisa el acceso solicitado</h2>
        <dl className="mt-4 space-y-4 text-sm">
          <div><dt className="font-semibold">Organización</dt><dd className="mt-1">{inspected.organization.name}</dd></div>
          <div><dt className="font-semibold">Rol</dt><dd className="mt-1">{inspected.role === "coach" ? "Coach" : "Manager"}</dd></div>
          <div><dt className="font-semibold">Sedes</dt><dd className="mt-1"><ul className="list-inside list-disc">{inspected.locations.map(location => <li key={location.id}>{location.name}</li>)}</ul></dd></div>
        </dl>
        <p className="mt-4 text-sm leading-6 text-slate-700">Al aceptar se crea tu membresía para estas sedes. Un coach necesita además un perfil vinculado y sesiones asignadas antes de poder gestionar su asistencia; esta pantalla no realiza esos pasos.</p>
        <button type="button" className={`${BUTTON} mt-5 w-full sm:w-auto`} disabled={busy} onClick={() => void accept()}>{busy ? "Confirmando…" : phase === "uncertain" ? "Reintentar la misma aceptación" : "Aceptar invitación"}</button>
      </section> : null}
      {phase === "accepted" ? <section role="status" className="mt-6 border border-teal-800 bg-teal-50 p-5">
        <h2 className="text-xl font-bold">Invitación aceptada</h2>
        <p className="mt-2 text-sm leading-6">Se ha confirmado tu membresía en {inspected?.organization.name} para las sedes revisadas. El vínculo del perfil y la asignación de sesiones son pasos posteriores del Owner; aceptar no habilita por sí solo la asistencia de un coach.</p>
      </section> : null}
    </main>
  );
}
