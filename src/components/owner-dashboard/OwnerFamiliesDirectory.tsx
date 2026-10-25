"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type FamilyDirectoryItem = {
  familyId: string;
  athletes: Array<{ athleteId: string; athleteName: string | null }>;
  payers: Array<{
    familyPayerId: string;
    displayName: string | null;
    isPrimary: boolean;
  }>;
};

type OwnerLocation = { id: string; name: string };

function familyLabel(family: FamilyDirectoryItem, index: number): string {
  const names = family.athletes
    .map((athlete) => athlete.athleteName?.trim())
    .filter((name): name is string => Boolean(name));
  return names.length ? names.join(", ") : `Familia ${index + 1}`;
}

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("es")
    .replace(/\s+/gu, " ")
    .trim();
}

export function OwnerFamiliesDirectory({
  organizationId,
  organizationName,
  locations,
  selectedLocationId,
  families,
  canManageBilling,
}: {
  organizationId: string;
  organizationName: string;
  locations: OwnerLocation[];
  selectedLocationId: string;
  families: FamilyDirectoryItem[];
  canManageBilling: boolean;
}) {
  const [search, setSearch] = useState("");
  const normalizedSearch = normalizeSearchText(search);
  const filteredFamilies = useMemo(() => {
    if (!normalizedSearch) return families;
    return families.filter((family) => {
      const searchableNames = [
        ...family.athletes.map((athlete) => athlete.athleteName ?? ""),
        ...family.payers.map((payer) => payer.displayName ?? ""),
      ];
      return searchableNames.some((name) =>
        normalizeSearchText(name).includes(normalizedSearch)
      );
    });
  }, [families, normalizedSearch]);
  const monthlyInvoicesHref = `/owner/monthly-invoices?${new URLSearchParams({
    organizationId,
    locationId: selectedLocationId,
  }).toString()}`;
  const enrollmentsHref = `/owner/enrollments?${new URLSearchParams({
    organizationId,
    locationId: selectedLocationId,
  }).toString()}`;

  return (
    <main className="min-h-screen bg-[#F1F3EF] px-5 py-6 text-slate-950 sm:py-10">
      <div className="mx-auto grid max-w-5xl gap-8">
        <header className="grid gap-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-teal-900">
              {organizationName}
            </p>
            <h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">
              Familias de la sede
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
              Consulta las familias vinculadas a gimnastas con una inscripción
              pendiente o activa en la sede seleccionada. La facturación
              permanece manual.
            </p>
          </div>

          <form
            action="/owner/families"
            method="get"
            className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex sm:items-end sm:justify-between"
          >
            <input type="hidden" name="organizationId" value={organizationId} />
            <label className="grid min-w-0 gap-2 text-sm font-semibold text-slate-800 sm:max-w-md sm:flex-1">
              Sede
              <select
                name="locationId"
                defaultValue={selectedLocationId}
                className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm"
              >
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="min-h-11 rounded-full border border-slate-400 bg-white px-4 text-sm font-bold text-slate-800 hover:bg-slate-50"
            >
              Ver familias
            </button>
          </form>

          <div className="flex flex-wrap gap-3">
            {canManageBilling ? (
              <Link
                href={monthlyInvoicesHref}
                className="inline-flex min-h-11 items-center rounded-full bg-teal-800 px-5 text-sm font-bold text-white hover:bg-teal-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800"
              >
                Vincular familias y responsables desde cuotas
              </Link>
            ) : null}
            <Link
              href={enrollmentsHref}
              className="inline-flex min-h-11 items-center rounded-full border border-slate-400 bg-white px-5 text-sm font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800"
            >
              Ver inscripciones
            </Link>
          </div>
        </header>

        {families.length === 0 ? (
          <section className="rounded-3xl border border-dashed border-slate-300 bg-white p-6 sm:p-8">
            <h2 className="font-display text-xl font-bold text-slate-950">
              Todavía no hay familias vinculadas en esta sede
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Las familias se crean al vincular una inscripción con una persona
              pagadora adulta desde la facturación mensual. No se crean cuentas
              familiares ni se envían correos desde esta vista.
            </p>
          </section>
        ) : (
          <section aria-labelledby="owner-families-list-heading">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2
                  id="owner-families-list-heading"
                  className="font-display text-xl font-bold text-slate-950"
                >
                  Familias vinculadas
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  {normalizedSearch
                    ? `${filteredFamilies.length} de ${families.length} familias`
                    : `${families.length} ${families.length === 1 ? "familia" : "familias"}`}
                </p>
              </div>
              <label className="grid w-full gap-2 text-sm font-semibold text-slate-800 sm:max-w-sm">
                Buscar gimnasta o responsable
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Nombre o apellidos"
                  aria-describedby="owner-families-search-help"
                  className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-normal"
                />
              </label>
            </div>
            <p id="owner-families-search-help" className="sr-only">
              La búsqueda se limita a las familias cargadas para esta sede.
            </p>
            <p aria-live="polite" className="sr-only">
              {normalizedSearch
                ? `${filteredFamilies.length} de ${families.length} familias encontradas`
                : `${families.length} ${families.length === 1 ? "familia" : "familias"} cargadas`}
            </p>
            {filteredFamilies.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6">
                <h3 className="font-semibold text-slate-900">
                  No hay familias que coincidan
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  Prueba con otro nombre de gimnasta o responsable.
                </p>
              </div>
            ) : (
              <ul className="grid gap-4 lg:grid-cols-2">
                {filteredFamilies.map((family, index) => {
                  const primaryPayers = family.payers.filter(
                    (payer) => payer.isPrimary
                  );
                  const otherPayers = family.payers.filter(
                    (payer) => !payer.isPrimary
                  );
                  return (
                    <li
                      key={family.familyId}
                      className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
                    >
                      <h3 className="font-display text-lg font-bold text-slate-950">
                        {familyLabel(family, index)}
                      </h3>
                      {canManageBilling ? (
                        <Link
                          href={`/owner/monthly-invoices?${new URLSearchParams({
                            organizationId,
                            locationId: selectedLocationId,
                            familyId: family.familyId,
                          }).toString()}`}
                          className="mt-3 inline-flex min-h-11 items-center rounded-full border border-teal-800 px-4 text-sm font-semibold text-teal-900 hover:bg-teal-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800"
                        >
                          Abrir facturación de {familyLabel(family, index)}
                        </Link>
                      ) : null}
                      <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        <div>
                          <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">
                            Gimnastas
                          </h4>
                          <ul className="mt-2 grid gap-1 text-sm text-slate-800">
                            {family.athletes.map((athlete) => (
                              <li key={athlete.athleteId}>
                                {athlete.athleteName?.trim() || "Nombre no disponible"}
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">
                            Responsables de pago
                          </h4>
                          {family.payers.length ? (
                            <ul className="mt-2 grid gap-2 text-sm text-slate-800">
                              {[...primaryPayers, ...otherPayers].map((payer) => (
                                <li key={payer.familyPayerId}>
                                  <span>
                                    {payer.displayName?.trim() || "Nombre no disponible"}
                                  </span>
                                  {payer.isPrimary ? (
                                    <span className="ml-2 rounded-full bg-teal-50 px-2 py-1 text-xs font-semibold text-teal-900">
                                      Principal
                                    </span>
                                  ) : null}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="mt-2 text-sm text-amber-900">
                              Falta asignar un responsable para facturar.
                            </p>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
