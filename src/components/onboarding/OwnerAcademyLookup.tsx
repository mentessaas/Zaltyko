"use client";
import Link from "next/link";
import { useState } from "react";
import { entryPath, type DirectoryEntry } from "@/lib/directory/contracts";

type PublicAcademy = {
  id: string;
  name: string;
  country: string | null;
  region: string | null;
  city: string | null;
};

export function OwnerAcademyLookup({
  name,
  countryCode,
  region = "",
  city,
  onReviewed,
  onCityChange,
  directoryEnabled = false,
  claimsEnabled = false,
}: {
  name: string;
  countryCode: string;
  region?: string;
  city: string;
  onReviewed: (key: string) => void;
  onCityChange?: (city: string) => void;
  directoryEnabled?: boolean;
  claimsEnabled?: boolean;
}) {
  const [results, setResults] = useState<DirectoryEntry[]>([]);
  const [publicAcademies, setPublicAcademies] = useState<PublicAcademy[]>([]);
  const [usedPublicFallback, setUsedPublicFallback] = useState(false);
  const [searched, setSearched] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const key = JSON.stringify([
    name.trim(),
    countryCode,
    region.trim(),
    city.trim(),
  ]);
  async function searchOperationalAcademies() {
    const publicQuery = new URLSearchParams({
      search: name.trim(),
      country: countryCode,
      limit: "10",
    });
    if (region.trim()) publicQuery.set("region", region.trim());
    if (city.trim()) publicQuery.set("city", city.trim());
    const publicResponse = await fetch(`/api/public/academies?${publicQuery}`);
    const publicBody = await publicResponse.json();
    if (!publicResponse.ok)
      throw new Error(
        publicBody.message ?? "No se pudo buscar. Inténtalo de nuevo."
      );
    const items = Array.isArray(publicBody.items)
      ? (publicBody.items as PublicAcademy[])
      : [];
    setPublicAcademies(items);
    setUsedPublicFallback(true);
    setSearched(key);
    if (items.length === 0) onReviewed(key);
  }

  async function search() {
    setBusy(true);
    setError("");
    setSearched(null);
    setResults([]);
    setPublicAcademies([]);
    setUsedPublicFallback(false);
    try {
      if (!directoryEnabled) {
        await searchOperationalAcademies();
        return;
      }

      const query = new URLSearchParams({
        kind: "academy",
        search: name.trim(),
        country: countryCode,
        limit: "10",
      });
      if (region.trim()) query.set("region", region.trim());
      if (city.trim()) query.set("city", city.trim());
      const response = await fetch(`/api/directory/catalog?${query}`);
      const body = await response.json();
      if (
        !response.ok &&
        (body.code === "DISABLED" || body.error === "DISABLED")
      ) {
        await searchOperationalAcademies();
        return;
      }
      if (!response.ok)
        throw new Error(
          body.message ?? "No se pudo buscar. Inténtalo de nuevo."
        );
      const items = Array.isArray(body.data?.items)
        ? (body.data.items as DirectoryEntry[])
        : [];
      setResults(items);
      setSearched(key);
      if (items.length === 0) onReviewed(key);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo buscar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="space-y-3 rounded-lg border p-4"
      aria-label="Comprobar si mi academia ya existe"
    >
      <h2 className="text-lg font-semibold">
        ¿Tu academia ya está en Zaltyko?
      </h2>
      <p>
        Introduce el nombre y el país de tu academia arriba; añade la región y
        localidad de la sede cuando las conozcas y busca antes de crearla.{" "}
        {!directoryEnabled
          ? "La búsqueda muestra perfiles públicos de academias que ya usan Zaltyko; todavía no consulta fichas externas."
          : claimsEnabled
            ? "Si ya tiene ficha, puedes solicitar gestionarla gratis. La reclamación requiere aprobación y no concede acceso al espacio privado."
            : "Si ya tiene ficha, solicita ayuda para vincularla y evitar duplicados. Las reclamaciones todavía no están activas."}
      </p>
      <label className="block" htmlFor="owner-academy-city">
        Localidad de la sede (opcional)
        <input
          id="owner-academy-city"
          className="mt-1 block w-full rounded border p-2"
          value={city}
          readOnly={!onCityChange}
          onChange={(e) => onCityChange?.(e.target.value)}
          placeholder="Ciudad de tu sede"
        />
      </label>
      <button
        type="button"
        disabled={busy || name.trim().length < 3}
        onClick={search}
        className="rounded border px-4 py-2 disabled:opacity-50"
      >
        {busy ? "Buscando…" : "Buscar mi academia"}
      </button>
      <div role="status" aria-live="polite">
        {error && <p>{error}</p>}
        {usedPublicFallback && (
          <p>
            El directorio de academias externas aún no está activo. Esta
            búsqueda solo muestra academias con perfil público operativo en
            Zaltyko; la cobertura no es exhaustiva.
          </p>
        )}
        {searched === key &&
          results.length === 0 &&
          publicAcademies.length === 0 && (
            <p>
              No encontramos coincidencias en los perfiles públicos disponibles.
              Puedes continuar con el alta; el servidor volverá a comprobar que
              no exista ya un espacio con esos datos.
            </p>
          )}
        {searched !== null && searched !== key && (
          <p>
            Has cambiado los datos de la sede. Repite la búsqueda antes de
            continuar.
          </p>
        )}
      </div>
      {searched === key && results.length > 0 && (
        <>
          <p>
            Encontramos fichas que debes revisar. La cobertura del catálogo no
            es exhaustiva.
          </p>
          <ul className="space-y-3">
            {results.map((entry) => (
              <li key={entry.id} className="rounded border p-3">
                <strong>{entry.data.name}</strong>
                <p>
                  {[entry.data.city, entry.data.region, entry.data.countryCode]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <Link className="underline" href={entryPath(entry)}>
                  {entry.academyId
                    ? "Revisar ficha y solicitar acceso al administrador"
                    : claimsEnabled
                      ? "Revisar ficha y solicitar reclamación"
                      : "Revisar ficha"}
                </Link>
                {!entry.academyId && !claimsEnabled && (
                  <Link
                    className="mt-2 block underline"
                    href={`/contact?type=support&directoryEntryId=${encodeURIComponent(entry.id)}`}
                  >
                    Solicitar ayuda para vincular esta academia
                  </Link>
                )}
              </li>
            ))}
          </ul>
          <p>
            Si es otra sede o entidad, puedes continuar. Una coincidencia exacta
            se revisará también en el servidor para evitar duplicados.
          </p>
          <button
            type="button"
            className="rounded border px-4 py-2"
            onClick={() => onReviewed(key)}
          >
            Ninguna corresponde a mi sede; continuar
          </button>
        </>
      )}
      {searched === key && publicAcademies.length > 0 && (
        <>
          <p>
            Encontramos perfiles públicos de academias que ya usan Zaltyko. Si
            es la tuya, no crees otro espacio: abre su ficha y pide a la persona
            responsable que te invite.
          </p>
          <ul className="space-y-3">
            {publicAcademies.map((academy) => (
              <li key={academy.id} className="rounded border p-3">
                <strong>{academy.name}</strong>
                <p>
                  {[academy.city, academy.region, academy.country]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <Link
                  className="underline"
                  href={`/academias/${encodeURIComponent(academy.id)}`}
                >
                  Abrir ficha pública
                </Link>
              </li>
            ))}
          </ul>
          <Link className="underline" href="/contact?type=support">
            Pedir ayuda para contactar con la persona responsable
          </Link>
          <button
            type="button"
            className="block rounded border px-4 py-2"
            onClick={() => onReviewed(key)}
          >
            Ninguna corresponde a mi sede; continuar
          </button>
        </>
      )}
    </section>
  );
}
