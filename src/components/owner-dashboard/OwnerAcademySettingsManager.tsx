"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import type { OwnerAcademySettings } from "@/modules/organizations/application/owner-academy-settings";
import { ownerPlanPublicName } from "./owner-plan-names";
import { ownerUi } from "./owner-ui";

const SETTINGS_ENDPOINT = "/api/v1/owner/academy-settings";

type ProblemBody = { detail?: unknown; type?: unknown };

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
                  ? "Tu plan incluye 1 sede. Para añadir otra necesitas el plan Network, que incluye varias sedes."
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
