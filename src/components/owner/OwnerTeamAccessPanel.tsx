"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import type {
  TeamAccess,
  TeamInvitation,
  TeamInvitationResult,
  TeamInvitationRevokeResult,
  TeamInvitationRole,
  TeamLocation,
} from "@/modules/staff/domain/team-access-contract";

const ENDPOINT = "/api/v1/owner/staff";
const BUTTON = "inline-flex min-h-11 items-center justify-center border border-slate-400 bg-white px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800 disabled:cursor-not-allowed disabled:opacity-55";
const INPUT = "mt-1 min-h-11 w-full border border-slate-400 bg-white px-3 text-base text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800";

type Command = {
  operation: "create" | "reissue" | "revoke";
  organizationId: string;
  endpoint: string;
  method: "POST" | "DELETE";
  body?: string;
  revision?: number;
  key: string;
  invitationId?: string;
  requested?: { email: string; role: TeamInvitationRole; locationIds: string[] };
};

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function locations(value: unknown): value is TeamLocation[] {
  return Array.isArray(value) && value.every(item => record(item) && typeof item.id === "string" && typeof item.name === "string");
}

function invitation(value: unknown): value is TeamInvitation {
  return record(value) && typeof value.id === "string" && typeof value.email === "string"
    && (value.role === "manager" || value.role === "coach")
    && ["pending", "accepted", "revoked"].includes(String(value.status))
    && typeof value.expired === "boolean" && typeof value.expiresAt === "string"
    && Number.isSafeInteger(value.revision) && Number(value.revision) > 0
    && locations(value.requestedLocations);
}

function access(value: unknown, organizationId: string): value is TeamAccess {
  return record(value) && record(value.organization) && value.organization.id === organizationId
    && typeof value.organization.name === "string" && locations(value.activeLocations)
    && Array.isArray(value.invitations) && value.invitations.every(invitation)
    && Array.isArray(value.members) && value.members.every(member => record(member)
      && typeof member.id === "string" && ["owner", "admin", "manager", "coach"].includes(String(member.role))
      && ["invited", "active", "suspended", "revoked"].includes(String(member.status))
      && (member.locationScopeMode === "all" || member.locationScopeMode === "selected")
      && locations(member.effectiveLocations));
}

function invitationResult(value: unknown): value is TeamInvitationResult {
  return record(value) && invitation(value.invitation) && typeof value.replayed === "boolean"
    && (value.token === null || (typeof value.token === "string" && /^[A-Za-z0-9_-]{43}$/.test(value.token)))
    && (!value.replayed || value.token === null);
}

function revokeResult(value: unknown, invitationId: string | undefined): value is TeamInvitationRevokeResult {
  return record(value) && value.id === invitationId && value.status === "revoked"
    && Number.isSafeInteger(value.revision) && Number(value.revision) > 0 && typeof value.replayed === "boolean";
}

function matchesCommand(value: TeamInvitationResult, command: Command): boolean {
  if (command.invitationId !== undefined && value.invitation.id !== command.invitationId) return false;
  if (!command.requested) return true;
  return value.invitation.email === command.requested.email && value.invitation.role === command.requested.role
    && value.invitation.requestedLocations.map(location => location.id).sort().join(",") === command.requested.locationIds.join(",");
}

function roleLabel(role: string): string {
  return ({ owner: "Owner", admin: "Administrador", manager: "Manager", coach: "Coach" } as Record<string, string>)[role] ?? role;
}

function invitationStatus(item: TeamInvitation): string {
  if (item.status === "accepted") return "Aceptada";
  if (item.status === "revoked") return "Revocada";
  return item.expired ? "Expirada" : "Pendiente";
}

function memberStatus(status: string): string {
  return ({ invited: "Invitado", active: "Activo", suspended: "Suspendido", revoked: "Revocado" } as Record<string, string>)[status] ?? status;
}

export function OwnerTeamAccessPanel({ organizationId }: { organizationId: string }) {
  const [data, setData] = useState<TeamAccess | null>(null);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Command | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<TeamInvitationRole>("coach");
  const [locationIds, setLocationIds] = useState<string[]>([]);
  const [revealedLink, setRevealedLink] = useState<string | null>(null);
  const busyRef = useRef(false);
  const pendingRef = useRef<Command | null>(null);
  const uncertainRef = useRef(false);
  const scopeRef = useRef(organizationId);
  const readRef = useRef(0);
  scopeRef.current = organizationId;

  const reload = useCallback(async () => {
    const requestId = ++readRef.current;
    setLoading(true);
    setListError("");
    // An earlier successful read is not current confirmation of effective access.
    setData(null);
    try {
      const response = await fetch(`${ENDPOINT}/access?${new URLSearchParams({ organizationId })}`, {
        cache: "no-store", credentials: "same-origin",
      });
      const payload: unknown = await response.json();
      if (requestId !== readRef.current || scopeRef.current !== organizationId) return;
      if (response.status !== 200 || !record(payload) || payload.ok !== true || !access(payload.data, organizationId)) {
        throw new Error("UNCONFIRMED_LIST");
      }
      const confirmed = payload.data;
      setData(confirmed);
      setLocationIds(current => current.filter(id => confirmed.activeLocations.some(location => location.id === id)));
    } catch {
      if (requestId === readRef.current && scopeRef.current === organizationId) {
        setListError("No se pudo confirmar el estado de los accesos. Vuelve a cargar la lista antes de realizar cambios.");
      }
    } finally {
      if (requestId === readRef.current && scopeRef.current === organizationId) setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    setRevealedLink(null);
    setMessage("");
    setError("");
    setEmail("");
    setLocationIds([]);
    setPending(null);
    pendingRef.current = null;
    uncertainRef.current = false;
    void reload();
    return () => { readRef.current += 1; };
  }, [reload]);

  async function run(command: Command) {
    if (busyRef.current || scopeRef.current !== command.organizationId) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    setRevealedLink(null);
    pendingRef.current = command;
    setPending(command);
    try {
      const response = await fetch(command.endpoint, {
        method: command.method, credentials: "same-origin", cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": command.key,
          ...(command.revision === undefined ? {} : { "If-Match": String(command.revision) }),
        },
        ...(command.body === undefined ? {} : { body: command.body }),
      });
      const payload: unknown = await response.json();
      if (scopeRef.current !== command.organizationId) return;
      if (response.status >= 500) throw new Error("UNCERTAIN_COMMAND");
      if (response.status >= 200 && response.status < 300 && (!record(payload) || payload.ok !== true)) {
        throw new Error("UNCONFIRMED_RECEIPT");
      }
      if (response.status < 200 || response.status >= 300) {
        if (uncertainRef.current) {
          setError("La sesión o el estado actual no permiten recuperar el recibo original. El resultado anterior sigue sin confirmar; conserva esta página y recupera la misma solicitud con el Owner original.");
          return;
        }
        pendingRef.current = null;
        setPending(null);
        setError(response.status === 409
          ? "La invitación cambió o ya existe una pendiente para ese correo. Se ha solicitado una lectura actual; revisa la fila antes de reemitir o revocar."
          : response.status === 401 || response.status === 403
            ? "Tu sesión no permite gestionar estos accesos. Inicia sesión con el Owner autorizado y vuelve a abrir Personal."
            : "No se pudo completar la operación. Revisa el estado actual antes de volver a intentarlo.");
      } else if (record(payload) && command.operation === "revoke" && revokeResult(payload.data, command.invitationId)) {
        pendingRef.current = null;
        uncertainRef.current = false;
        setPending(null);
        setMessage("Invitación revocada. Esta acción no revoca una membresía ya aceptada.");
      } else if (record(payload) && command.operation !== "revoke" && invitationResult(payload.data)
        && matchesCommand(payload.data, command)) {
        pendingRef.current = null;
        uncertainRef.current = false;
        setPending(null);
        if (payload.data.token && !payload.data.replayed) {
          setRevealedLink(`${window.location.origin}/staff/accept#token=${payload.data.token}`);
          setMessage("Enlace disponible solo en esta pantalla. No se ha enviado ningún correo. Copia el enlace para compartirlo manualmente.");
        } else {
          setMessage("Operación recuperada sin enlace. El enlace original no se vuelve a revelar. Si lo necesitas, usa Reemitir enlace en la invitación pendiente; invalidará el anterior.");
        }
        if (command.operation === "create") setEmail("");
      } else {
        throw new Error("UNCONFIRMED_RECEIPT");
      }
    } catch {
      if (scopeRef.current === command.organizationId) {
        uncertainRef.current = true;
        setError("El resultado no está confirmado. Se ha solicitado una lectura actual sin enviar otra operación. Puedes recuperar la misma solicitud con su clave original; no crees otra invitación.");
      }
    } finally {
      if (scopeRef.current === command.organizationId) {
        await reload();
        setBusy(false);
      }
      busyRef.current = false;
    }
  }

  function start(operation: Command["operation"], item?: TeamInvitation) {
    if (!data || loading || busyRef.current || pendingRef.current) return;
    if (operation !== "create" && (!item || item.status !== "pending")) return;
    if (operation === "create" && (!email.trim() || locationIds.length === 0)) {
      setError("Indica un correo y selecciona al menos una sede activa.");
      return;
    }
    let key: string;
    try { key = window.crypto.randomUUID(); } catch {
      setError("No se pudo preparar una clave segura. No se ha enviado la operación.");
      return;
    }
    const requested = operation === "create" ? { email: email.trim().toLowerCase(), role, locationIds: [...locationIds].sort() } : undefined;
    const body = operation === "create"
      ? JSON.stringify({ organizationId, ...requested })
      : operation === "reissue" ? JSON.stringify({ organizationId }) : undefined;
    const endpoint = operation === "create" ? `${ENDPOINT}/invitations`
      : operation === "reissue" ? `${ENDPOINT}/invitations/${encodeURIComponent(item!.id)}/reissue`
        : `${ENDPOINT}/invitations/${encodeURIComponent(item!.id)}?${new URLSearchParams({ organizationId })}`;
    void run({ operation, organizationId, endpoint, method: operation === "revoke" ? "DELETE" : "POST", body, revision: item?.revision, key, invitationId: item?.id, requested });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    start("create");
  }

  const disabled = busy || loading || !data || pending !== null;

  return (
    <section aria-labelledby="team-access-title" className="mx-auto max-w-6xl px-5 pb-12 lg:px-10 [overflow-wrap:anywhere]">
      <header className="border-t border-slate-300 pt-7">
        <h2 id="team-access-title" className="font-display text-2xl font-bold text-slate-950">Accesos de equipo</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">Invita a una persona con su propia cuenta y sedes seleccionadas. Los perfiles de Personal son independientes: un perfil sin cuenta no concede acceso.</p>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">Esta fase permite invitar y aceptar. El vínculo del perfil, la asignación de sesiones y la baja de miembros no están disponibles aquí. Aceptar como coach todavía no habilita asistencia a sesiones.</p>
      </header>
      {error ? <p role="alert" className="mt-4 border border-amber-700 bg-amber-50 p-4 text-sm leading-6">{error}</p> : null}
      {message ? <p role="status" className="mt-4 border border-teal-800 bg-teal-50 p-4 text-sm leading-6">{message}</p> : null}
      {pending ? <div className="mt-4 border border-amber-700 p-4">
        <p className="text-sm leading-6">La solicitud se conserva solo en la memoria de esta página. No se reenvía al abrir ni al actualizar la lista. Si cierras esta página perderás la clave de recuperación.</p>
        <button type="button" className={`${BUTTON} mt-3`} disabled={busy} onClick={() => void run(pending)}>Recuperar la misma solicitud</button>
      </div> : null}
      {revealedLink ? <div className="mt-4 border border-teal-800 bg-teal-50 p-4">
        <label htmlFor="team-invitation-link" className="block text-sm font-semibold">Enlace privado para compartir una vez</label>
        <textarea id="team-invitation-link" className={`${INPUT} min-h-24 py-3 [overflow-wrap:anywhere]`} value={revealedLink} readOnly spellCheck={false} autoComplete="off" />
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <button type="button" className={BUTTON} onClick={() => {
            if (!navigator.clipboard) {
              setError("No se pudo copiar. Selecciona y copia el enlace visible.");
              return;
            }
            void navigator.clipboard.writeText(revealedLink).then(() => setMessage("Enlace copiado. Compártelo manualmente con la persona invitada."), () => setError("No se pudo copiar. Selecciona y copia el enlace visible."));
          }}>Copiar enlace</button>
          <button type="button" className={BUTTON} onClick={() => setRevealedLink(null)}>Ocultar enlace</button>
        </div>
      </div> : null}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="font-display text-xl font-bold">Estado actual</h3>
        <button type="button" className={BUTTON} disabled={loading || busy} onClick={() => void reload()}>Actualizar accesos</button>
      </div>
      {loading ? <p role="status" className="mt-4 text-sm">Cargando accesos…</p> : null}
      {listError ? <p role="alert" className="mt-4 border border-rose-700 bg-rose-50 p-4 text-sm leading-6">{listError}</p> : null}
      <form className="mt-5 space-y-5 border border-slate-300 bg-white p-4 sm:p-6" onSubmit={submit}>
        <h3 className="font-display text-xl font-bold">Crear invitación</h3>
        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          <label className="min-w-0 text-sm font-semibold" htmlFor="team-email">Correo de la persona invitada
            <input id="team-email" type="email" autoComplete="off" maxLength={254} required disabled={disabled} value={email} onChange={event => setEmail(event.target.value)} className={INPUT} />
          </label>
          <label className="min-w-0 text-sm font-semibold" htmlFor="team-role">Rol solicitado
            <select id="team-role" value={role} disabled={disabled} onChange={event => setRole(event.target.value as TeamInvitationRole)} className={INPUT}>
              <option value="coach">Coach</option><option value="manager">Manager</option>
            </select>
          </label>
        </div>
        <fieldset disabled={disabled}>
          <legend className="text-sm font-semibold">Sedes solicitadas · selecciona al menos una</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {data?.activeLocations.map(location => <label key={location.id} className="flex min-h-11 min-w-0 items-center gap-3 border border-slate-300 px-3 py-2 text-sm">
              <input type="checkbox" checked={locationIds.includes(location.id)} onChange={event => setLocationIds(current => event.target.checked ? [...current, location.id] : current.filter(id => id !== location.id))} className="h-5 w-5 shrink-0 accent-teal-800" />
              <span className="min-w-0">{location.name}</span>
            </label>)}
          </div>
          {data?.activeLocations.length === 0 ? <p className="mt-2 text-sm">No hay sedes activas para invitar.</p> : null}
        </fieldset>
        <p className="text-sm leading-6 text-slate-700">Solicitados; todavía sin acceso: {roleLabel(role)} · {data?.activeLocations.filter(location => locationIds.includes(location.id)).map(location => location.name).join(", ") || "sin sedes seleccionadas"}. No se envía correo automático.</p>
        <button type="submit" className={BUTTON} disabled={disabled || locationIds.length === 0}>Crear invitación y mostrar enlace</button>
      </form>
      {data ? <>
        <section className="mt-7" aria-labelledby="team-invitations-title">
          <h3 id="team-invitations-title" className="font-display text-xl font-bold">Invitaciones</h3>
          {data.invitations.length === 0 ? <p className="mt-3 text-sm text-slate-700">No hay invitaciones registradas.</p> : <ul className="mt-3 divide-y divide-slate-200 border-y border-slate-200">
            {data.invitations.map(item => <li key={item.id} className="py-4">
              <article aria-label={`Invitación para ${item.email}`} className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <h4 className="font-semibold">{item.email}</h4>
                  <p className="mt-1 text-sm">{roleLabel(item.role)} · {invitationStatus(item)}</p>
                  <p className="mt-2 text-sm text-slate-700">Sedes solicitadas: {item.requestedLocations.map(location => location.name).join(", ") || "sin sedes confirmadas"}.</p>
                  <p className="mt-1 text-sm text-slate-700">{item.status === "pending" ? "Todavía sin acceso por esta invitación." : "Consulta los miembros para comprobar el acceso actual."}</p>
                  <p className="mt-1 text-xs text-slate-600">Vencimiento: {item.expiresAt} · revisión {item.revision}</p>
                </div>
                {item.status === "pending" ? <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:flex-wrap">
                  <button type="button" className={BUTTON} disabled={disabled} onClick={() => start("reissue", item)}>Reemitir enlace</button>
                  <button type="button" className={BUTTON} disabled={disabled} onClick={() => start("revoke", item)}>Revocar invitación</button>
                </div> : null}
              </article>
            </li>)}
          </ul>}
          <p className="mt-3 text-sm leading-6 text-slate-700">Reemitir invalida el enlace anterior y revela uno nuevo una sola vez. Revocar una invitación pendiente, incluso expirada, impide aceptarla; no da de baja a un miembro.</p>
        </section>
        <section className="mt-7" aria-labelledby="team-members-title">
          <h3 id="team-members-title" className="font-display text-xl font-bold">Miembros</h3>
          {data.members.length === 0 ? <p className="mt-3 text-sm text-slate-700">No hay miembros en la lectura actual.</p> : <ul className="mt-3 divide-y divide-slate-200 border-y border-slate-200">
            {data.members.map((member, index) => <li key={member.id} className="py-4">
              <h4 className="font-semibold">Miembro {index + 1} · {roleLabel(member.role)}</h4>
              <p className="mt-1 text-sm">{memberStatus(member.status)}</p>
              <p className="mt-2 text-sm text-slate-700">{member.status === "active"
                ? `Sedes con acceso efectivo: ${member.effectiveLocations.map(location => location.name).join(", ") || "ninguna confirmada"}.`
                : "Sin acceso activo confirmado."}</p>
            </li>)}
          </ul>}
        </section>
      </> : null}
    </section>
  );
}
