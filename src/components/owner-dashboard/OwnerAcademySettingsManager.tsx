"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import type { OwnerAcademySettings } from "@/modules/organizations/application/owner-academy-settings";
import { ownerPlanPublicName } from "./owner-plan-names";
import { ownerUi } from "./owner-ui";

const SETTINGS_ENDPOINT = "/api/v1/owner/academy-settings";

type ProblemBody = { detail?: unknown; type?: unknown };

function OwnerAcademyLogoSettings({ organizationId, academyName }: { organizationId: string; academyName: string }) {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const loadLogo = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/v1/owner/academy-settings/logo?organizationId=${encodeURIComponent(organizationId)}`, { cache: "no-store" });
      if (!response.ok) throw new Error((await problemOf(response, "No hemos podido cargar el logo.")).text);
      const body = (await response.json()) as { data: { logoUrl: string | null; available: boolean } };
      setLogoUrl(body.data.logoUrl);
      setAvailable(body.data.available);
    } catch {
      setMessage({ ok: false, text: "No hemos podido cargar el logo. Comprueba la conexión e inténtalo de nuevo." });
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => { void loadLogo(); }, [loadLogo]);

  async function uploadLogo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const file = form.elements.namedItem("academy-logo") as HTMLInputElement | null;
    if (!file?.files?.[0] || busy) return;
    setBusy(true);
    setMessage(null);
    const data = new FormData();
    data.set("organizationId", organizationId);
    data.set("file", file.files[0]);
    try {
      const response = await fetch("/api/v1/owner/academy-settings/logo", { method: "POST", body: data });
      if (!response.ok) throw new Error((await problemOf(response, "No hemos podido guardar el logo.")).text);
      const body = (await response.json()) as { data: { logoUrl: string } };
      setLogoUrl(body.data.logoUrl);
      setMessage({ ok: true, text: "Logo guardado. Ya aparece en los diplomas." });
      form.reset();
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "No hemos podido guardar el logo. Inténtalo de nuevo." });
    } finally {
      setBusy(false);
    }
  }

  async function removeLogo() {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/v1/owner/academy-settings/logo", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ organizationId }),
      });
      if (!response.ok) throw new Error((await problemOf(response, "No hemos podido quitar el logo.")).text);
      setLogoUrl(null);
      setMessage({ ok: true, text: "Logo quitado. Los diplomas volverán a mostrar solo el nombre de la academia." });
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "No hemos podido quitar el logo. Inténtalo de nuevo." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={ownerUi.card} aria-labelledby="academy-logo-title">
      <h2 id="academy-logo-title" className={ownerUi.sectionTitle}>Logo del club</h2>
      <p className={`mt-2 ${ownerUi.muted}`}>Añade el logo que aparecerá en los diplomas de nivel. Puedes cambiarlo o quitarlo cuando quieras.</p>
      {available === false ? <p className={`mt-3 ${ownerUi.help}`} role="status">El logo estará disponible cuando se actualicen los ajustes de la academia.</p> : null}
      {logoUrl ? (
        <div className="mt-4 flex flex-wrap items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoUrl} alt={`Vista previa del logo de ${academyName}`} className="h-20 max-w-48 rounded-md border border-z-line bg-white p-2 object-contain" />
          <button type="button" className={ownerUi.secondaryButton} onClick={() => void removeLogo()} disabled={busy}>
            {busy ? "Guardando…" : "Quitar logo"}
          </button>
        </div>
      ) : null}
      {loading ? <p className={`mt-3 ${ownerUi.help}`} role="status">Cargando logo…</p> : null}
      {available === true ? <form onSubmit={uploadLogo} className="mt-4 grid max-w-xl gap-3">
        <label htmlFor="academy-logo" className={ownerUi.label}>{logoUrl ? "Cambiar logo" : "Subir logo"}</label>
        <input
          id="academy-logo"
          name="academy-logo"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          required
          disabled={busy || loading}
          aria-describedby="academy-logo-help"
          className="block w-full rounded-md border border-z-line bg-white px-3 py-2 text-sm text-z-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-z-blue"
        />
        <p id="academy-logo-help" className={ownerUi.help}>PNG, JPG o WebP. Tamaño máximo: 1 MB.</p>
        <div><button type="submit" className={ownerUi.primaryButton} disabled={busy || loading}>{busy ? "Guardando…" : "Guardar logo"}</button></div>
      </form> : null}
      {message ? <p className={`mt-3 ${message.ok ? ownerUi.noticeInfo : ownerUi.noticeError}`} role={message.ok ? "status" : "alert"}>{message.text}</p> : null}
    </section>
  );
}

async function problemOf(response: Response, fallback: string): Promise<{ text: string; versionConflict: boolean }> {
  const body = (await response.json().catch(() => null)) as ProblemBody | null;
  return {
    text: typeof body?.detail === "string" && body.detail ? body.detail : fallback,
    versionConflict: typeof body?.type === "string" && body.type.endsWith("/version-conflict"),
  };
}

function newKey(): string {
  return `settings-${crypto.randomUUID()}`;
}

export function OwnerAcademySettingsManager({ organizationId }: { organizationId: string }) {
  const [settings, setSettings] = useState<OwnerAcademySettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [legalName, setLegalName] = useState("");
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileMessage, setProfileMessage] = useState<{ ok: boolean; text: string; versionConflict?: boolean } | null>(null);
  const [locationName, setLocationName] = useState("");
  const [timezone, setTimezone] = useState("");
  const [locationBusy, setLocationBusy] = useState(false);
  const [locationMessage, setLocationMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async (keepDraft = false) => {
    setLoadError(null);
    try {
      const response = await fetch(`${SETTINGS_ENDPOINT}?organizationId=${organizationId}`, { cache: "no-store" });
      if (!response.ok) {
        setLoadError((await problemOf(response, "No hemos podido cargar los ajustes.")).text);
        return;
      }
      const body = (await response.json()) as { data: OwnerAcademySettings };
      setSettings(body.data);
      if (!keepDraft) {
        setName(body.data.organization.name);
        setLegalName(body.data.organization.legalName ?? "");
      }
      setTimezone((current) => current || body.data.timezoneOptions[0] || "");
    } catch {
      setLoadError("No hemos podido cargar los ajustes. Comprueba la conexión e inténtalo de nuevo.");
    }
  }, [organizationId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    if (!settings || profileBusy) return;
    setProfileBusy(true);
    setProfileMessage(null);
    try {
      const response = await fetch(SETTINGS_ENDPOINT, {
        method: "PATCH",
        headers: { "content-type": "application/json", "idempotency-key": newKey() },
        body: JSON.stringify({
          organizationId,
          expectedUpdatedAt: settings.organization.updatedAt,
          name,
          legalName: legalName.trim() === "" ? null : legalName,
        }),
      });
      if (!response.ok) {
        const problem = await problemOf(response, "No hemos podido guardar los cambios.");
        setProfileMessage({ ok: false, text: problem.text, versionConflict: problem.versionConflict });
        return;
      }
      setProfileMessage({ ok: true, text: "Cambios guardados." });
      await load(true);
    } catch {
      setProfileMessage({ ok: false, text: "No hemos podido guardar. Comprueba la conexión e inténtalo de nuevo." });
    } finally {
      setProfileBusy(false);
    }
  }

  async function addLocation(event: FormEvent) {
    event.preventDefault();
    if (!settings || locationBusy) return;
    setLocationBusy(true);
    setLocationMessage(null);
    try {
      const response = await fetch(`${SETTINGS_ENDPOINT}/locations`, {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": newKey() },
        body: JSON.stringify({ organizationId, name: locationName, timezone }),
      });
      if (!response.ok) {
        setLocationMessage({ ok: false, text: (await problemOf(response, "No hemos podido añadir la sede.")).text });
        await load(true);
        return;
      }
      setLocationName("");
      setLocationMessage({ ok: true, text: "Sede añadida." });
      await load(true);
    } catch {
      setLocationMessage({ ok: false, text: "No hemos podido añadir la sede. Comprueba la conexión e inténtalo de nuevo." });
    } finally {
      setLocationBusy(false);
    }
  }

  async function deactivateLocation(locationId: string, locationLabel: string) {
    if (!settings || locationBusy || capacity.activeLocations <= 1) return;
    if (!window.confirm(`¿Quieres desactivar la sede «${locationLabel}»? Se conservará su historial y dejará de contar para el precio.`)) return;
    setLocationBusy(true);
    setLocationMessage(null);
    try {
      const response = await fetch(`${SETTINGS_ENDPOINT}/locations`, {
        method: "DELETE",
        headers: { "content-type": "application/json", "idempotency-key": newKey() },
        body: JSON.stringify({ organizationId, locationId }),
      });
      if (!response.ok) {
        setLocationMessage({ ok: false, text: (await problemOf(response, "No hemos podido desactivar la sede.")).text });
        await load(true);
        return;
      }
      setLocationMessage({ ok: true, text: "Sede desactivada. El importe se ha actualizado según las sedes activas." });
      await load(true);
    } catch {
      setLocationMessage({ ok: false, text: "No hemos podido desactivar la sede. Comprueba la conexión e inténtalo de nuevo." });
    } finally {
      setLocationBusy(false);
    }
  }

  if (loadError) {
    return (
      <div className={ownerUi.noticeError} role="alert">
        <p>{loadError}</p>
        <button type="button" className={`${ownerUi.secondaryButton} mt-3`} onClick={() => void load()}>
          Reintentar
        </button>
      </div>
    );
  }
  if (!settings) return <p className={ownerUi.muted} role="status">Cargando ajustes…</p>;

  const { organization, locationCapacity: capacity } = settings;
  const planName = ownerPlanPublicName(capacity.planCode) ?? "tu plan";
  const profileError = profileMessage !== null && !profileMessage.ok;
  const locationError = locationMessage !== null && !locationMessage.ok;
  const dirty = name !== organization.name || (legalName.trim() || null) !== organization.legalName;
  const subscriptionHref = `/owner/subscription?organizationId=${organizationId}`;

  return (
    <div className="grid gap-6">
      <section className={ownerUi.card} aria-labelledby="academy-data-title">
        <h2 id="academy-data-title" className={ownerUi.sectionTitle}>Datos de la academia</h2>
        <form onSubmit={saveProfile} className="mt-5 grid gap-5">
          <div className="grid gap-5 md:grid-cols-2">
            <div className="min-w-0">
              <label htmlFor="academy-name" className={ownerUi.label}>Nombre de la academia</label>
              <input id="academy-name" className={`mt-2 ${ownerUi.field}`} value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={120} disabled={profileBusy} aria-invalid={profileError ? true : undefined} aria-describedby={profileError ? "profile-message" : undefined} />
            </div>
            <div className="min-w-0">
              <label htmlFor="academy-legal-name" className={ownerUi.label}>Razón social (opcional)</label>
              <input id="academy-legal-name" className={`mt-2 ${ownerUi.field}`} value={legalName} onChange={(e) => setLegalName(e.target.value)} maxLength={180} disabled={profileBusy} aria-invalid={profileError ? true : undefined} aria-describedby={profileError ? "profile-message" : undefined} />
              <p className={`mt-1 ${ownerUi.help}`}>El nombre legal de la entidad, si es distinto del nombre comercial.</p>
            </div>
          </div>
          <dl className="grid gap-4 sm:grid-cols-3">
            <div><dt className={ownerUi.smallLabel}>País</dt><dd className="mt-1 text-sm text-z-ink">{organization.countryLabel}</dd></div>
            <div><dt className={ownerUi.smallLabel}>Moneda</dt><dd className="mt-1 text-sm text-z-ink">{organization.defaultCurrency}</dd></div>
            <div><dt className={ownerUi.smallLabel}>Zona horaria</dt><dd className="mt-1 text-sm text-z-ink">{organization.defaultTimezone}</dd></div>
          </dl>
          <p className={ownerUi.help}>El país, la moneda y la zona horaria se fijan al crear la academia y no se pueden cambiar desde aquí.</p>
          {settings.programs.length > 0 ? (
            <div>
              <p className={ownerUi.smallLabel}>Disciplinas y actividades</p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {settings.programs.map((program) => (
                  <li key={`${program.kind}:${program.name}`} className={ownerUi.chip}>{program.name}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {profileMessage ? (
            <div id="profile-message" role={profileMessage.ok ? "status" : "alert"} className={profileMessage.ok ? ownerUi.noticeInfo : ownerUi.noticeError}>
              <p>{profileMessage.text}</p>
              {profileMessage.versionConflict ? (
                <button type="button" className={`${ownerUi.secondaryButton} mt-3`} onClick={() => { setProfileMessage(null); void load(true); }}>
                  Recargar datos
                </button>
              ) : null}
            </div>
          ) : null}
          <div>
            <button type="submit" className={ownerUi.primaryButton} disabled={!dirty || profileBusy}>
              {profileBusy ? "Guardando…" : "Guardar cambios"}
            </button>
          </div>
        </form>
      </section>

      <OwnerAcademyLogoSettings organizationId={organizationId} academyName={organization.name} />

      <section className={ownerUi.card} aria-labelledby="academy-locations-title">
        <h2 id="academy-locations-title" className={ownerUi.sectionTitle}>Sedes</h2>
        <p className={`mt-2 ${ownerUi.muted}`}>
          {capacity.locationLimit === null
            ? `Tu plan ${planName} no limita las sedes. Tienes ${capacity.activeLocations}.`
            : `Tu plan ${planName} incluye ${capacity.locationLimit} ${capacity.locationLimit === 1 ? "sede" : "sedes"}. Tienes ${capacity.activeLocations}.`}
        </p>
        <ul className="mt-4 grid gap-3">
          {settings.locations.map((location) => (
            <li key={location.id} className={ownerUi.listItem}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-z-ink">{location.name}</span>
                {location.isActive ? null : <span className={ownerUi.chipAttention}>Inactiva</span>}
                {location.isActive && capacity.activeLocations > 1 ? (
                  <button type="button" className={ownerUi.textLink} disabled={locationBusy}
                    onClick={() => void deactivateLocation(location.id, location.name)}>
                    Desactivar sede
                  </button>
                ) : null}
              </div>
              <p className={`mt-1 ${ownerUi.help}`}>Zona horaria: {location.timezone}</p>
            </li>
          ))}
        </ul>
        {settings.locationsTruncated ? <p className={`mt-3 ${ownerUi.help}`}>Se muestran las primeras {settings.locations.length} sedes.</p> : null}

        {capacity.canAddLocation ? (
          <form onSubmit={addLocation} className="mt-6 grid gap-4 border-t border-z-line pt-5" aria-label="Añadir sede">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="min-w-0">
                <label htmlFor="location-name" className={ownerUi.label}>Nombre de la nueva sede</label>
                <input id="location-name" className={`mt-2 ${ownerUi.field}`} value={locationName} onChange={(e) => setLocationName(e.target.value)} required minLength={2} maxLength={120} disabled={locationBusy} aria-invalid={locationError ? true : undefined} aria-describedby={locationError ? "location-message" : undefined} />
              </div>
              <div className="min-w-0">
                <label htmlFor="location-timezone" className={ownerUi.label}>Zona horaria</label>
                <select id="location-timezone" className={`mt-2 ${ownerUi.field}`} value={timezone} onChange={(e) => setTimezone(e.target.value)} disabled={locationBusy}>
                  {settings.timezoneOptions.map((zone) => <option key={zone} value={zone}>{zone}</option>)}
                </select>
              </div>
            </div>
            <div>
              <button type="submit" className={ownerUi.primaryButton} disabled={locationBusy || locationName.trim().length < 2}>
                {locationBusy ? "Añadiendo…" : "Añadir sede"}
              </button>
            </div>
          </form>
        ) : (
          <div className={`${ownerUi.noticeWarning} mt-6`} role="note">
            {capacity.blockedReason === "read_only" ? (
              <p>Tu academia está en solo lectura porque supera los límites del plan. Resuélvelo desde Plan antes de añadir otra sede.</p>
            ) : (
              <p>
                {capacity.locationLimit === 1
                  ? "El plan Gratis incluye 1 sede. Cambia a Club para añadir sedes adicionales."
                  : `Tu plan incluye ${capacity.locationLimit} sedes y ya las tienes todas.`}
              </p>
            )}
            <Link href={subscriptionHref} className={`${ownerUi.textLink} mt-2 inline-block`}>Ver plan y facturación</Link>
          </div>
        )}
        {locationMessage ? (
          <p id="location-message" role={locationMessage.ok ? "status" : "alert"} className={`mt-4 ${locationMessage.ok ? ownerUi.noticeInfo : ownerUi.noticeError}`}>{locationMessage.text}</p>
        ) : null}
      </section>
    </div>
  );
}
