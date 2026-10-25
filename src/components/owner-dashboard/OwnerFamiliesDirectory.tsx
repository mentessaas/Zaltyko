"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";

type FamilyDirectoryItem = {
  familyId: string;
  isActive: boolean;
  familyVersion: string;
  athletes: Array<{ athleteId: string; athleteName: string | null }>;
  payers: Array<{
    familyPayerId: string;
    givenName: string;
    familyName: string;
    profileVersion: string;
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
  canManageFamilies = false,
}: {
  organizationId: string;
  organizationName: string;
  locations: OwnerLocation[];
  selectedLocationId: string;
  families: FamilyDirectoryItem[];
  canManageBilling: boolean;
  canManageFamilies?: boolean;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [editingPayer, setEditingPayer] = useState<{
    familyPayerId: string;
    profileVersion: string;
  } | null>(null);
  const [payerForm, setPayerForm] = useState({ givenName: "", familyName: "" });
  const [payerSaveState, setPayerSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [payerSaveMessage, setPayerSaveMessage] = useState("");
  const [pendingFamilyAction, setPendingFamilyAction] = useState<{
    familyId: string;
    action: "archive" | "restore";
  } | null>(null);
  const [familyLifecycleState, setFamilyLifecycleState] = useState<
    "idle" | "saving" | "error"
  >("idle");
  const [familyLifecycleMessage, setFamilyLifecycleMessage] = useState("");
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

  async function savePayerProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingPayer || payerSaveState === "saving") return;
    setPayerSaveState("saving");
    setPayerSaveMessage("");
    try {
      const response = await fetch(
        `/api/v1/owner/families/payers/${editingPayer.familyPayerId}`,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            "idempotency-key": `family-payer-${crypto.randomUUID()}`,
          },
          body: JSON.stringify({
            organizationId,
            locationId: selectedLocationId,
            expectedProfileVersion: editingPayer.profileVersion,
            givenName: payerForm.givenName,
            familyName: payerForm.familyName,
          }),
        }
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          typeof payload?.detail === "string"
            ? payload.detail
            : "No se pudo guardar. Actualiza la página e inténtalo de nuevo."
        );
      }
      setPayerSaveState("saved");
      setPayerSaveMessage("Responsable actualizado.");
      setEditingPayer(null);
      router.refresh();
    } catch (error) {
      setPayerSaveState("error");
      setPayerSaveMessage(
        error instanceof Error
          ? error.message
          : "No se pudo guardar. Actualiza la página e inténtalo de nuevo."
      );
    }
  }

  async function saveFamilyLifecycle(family: FamilyDirectoryItem) {
    if (!pendingFamilyAction || familyLifecycleState === "saving") return;
    setFamilyLifecycleState("saving");
    setFamilyLifecycleMessage("");
    try {
      const response = await fetch(
        `/api/v1/owner/families/${family.familyId}/lifecycle`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": `family-${pendingFamilyAction.action}-${crypto.randomUUID()}`,
          },
          body: JSON.stringify({
            organizationId,
            action: pendingFamilyAction.action,
            expectedFamilyVersion: family.familyVersion,
          }),
        }
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          typeof payload?.detail === "string"
            ? payload.detail
            : "No se pudo actualizar la familia. Recarga la página e inténtalo de nuevo."
        );
      }
      setFamilyLifecycleState("idle");
      setFamilyLifecycleMessage(
        pendingFamilyAction.action === "archive"
          ? "Familia archivada. Sus registros e historial se conservan."
          : "Familia reactivada. Sus registros e historial se conservan."
      );
      setPendingFamilyAction(null);
      router.refresh();
    } catch (error) {
      setFamilyLifecycleState("error");
      setFamilyLifecycleMessage(
        error instanceof Error
          ? error.message
          : "No se pudo actualizar la familia. Recarga la página e inténtalo de nuevo."
      );
    }
  }

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
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="font-display text-lg font-bold text-slate-950">
                          {familyLabel(family, index)}
                        </h3>
                        <span
                          className={
                            family.isActive
                              ? "rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-900"
                              : "rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700"
                          }
                        >
                          {family.isActive ? "Activa" : "Archivada"}
                        </span>
                      </div>
                      {canManageBilling ? (
                        <Link
                          href={`/owner/monthly-invoices?${new URLSearchParams({
                            organizationId,
                            locationId: selectedLocationId,
                            familyId: family.familyId,
                          }).toString()}`}
                          className="mt-3 inline-flex min-h-11 items-center rounded-full border border-teal-800 px-4 text-sm font-semibold text-teal-900 hover:bg-teal-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800"
                        >
                          {family.isActive ? "Abrir" : "Consultar"} facturación de {familyLabel(family, index)}
                        </Link>
                      ) : null}
                      {canManageFamilies ? (
                        <div className="mt-3">
                          <button
                            type="button"
                            className="min-h-10 rounded-full border border-slate-400 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800"
                            onClick={() => {
                              setPendingFamilyAction({
                                familyId: family.familyId,
                                action: family.isActive ? "archive" : "restore",
                              });
                              setFamilyLifecycleState("idle");
                              setFamilyLifecycleMessage("");
                            }}
                          >
                            {family.isActive ? "Archivar familia" : "Reactivar familia"}
                          </button>
                          {pendingFamilyAction?.familyId === family.familyId ? (
                            <div
                              className="mt-3 grid gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3"
                              role="group"
                              aria-label={`${pendingFamilyAction.action === "archive" ? "Confirmar archivo" : "Confirmar reactivación"} de ${familyLabel(family, index)}`}
                            >
                              <p className="text-sm leading-6 text-amber-950">
                                {pendingFamilyAction.action === "archive"
                                  ? "La familia dejará de estar disponible para nuevas asociaciones y las nuevas cuotas señalarán que está archivada. Gimnastas, responsables, inscripciones, facturas, pagos e historial no se borran ni se archivan."
                                  : "La familia volverá a estar disponible para futuras asociaciones. Sus inscripciones, facturas, pagos e historial existentes no se reescriben."}
                              </p>
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  disabled={familyLifecycleState === "saving"}
                                  className="min-h-10 rounded-full bg-teal-800 px-4 text-sm font-bold text-white disabled:opacity-60"
                                  onClick={() => void saveFamilyLifecycle(family)}
                                >
                                  {familyLifecycleState === "saving"
                                    ? "Guardando…"
                                    : pendingFamilyAction.action === "archive"
                                      ? "Confirmar archivo"
                                      : "Confirmar reactivación"}
                                </button>
                                <button
                                  type="button"
                                  disabled={familyLifecycleState === "saving"}
                                  className="min-h-10 rounded-full border border-slate-400 bg-white px-4 text-sm font-semibold disabled:opacity-60"
                                  onClick={() => setPendingFamilyAction(null)}
                                >
                                  Cancelar
                                </button>
                              </div>
                            </div>
                          ) : null}
                        </div>
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
                                  {canManageBilling && family.isActive ? (
                                    <button
                                      type="button"
                                      className="ml-2 rounded px-1 text-xs font-semibold text-teal-900 underline underline-offset-2 hover:text-teal-700"
                                      aria-label={`Editar responsable ${payer.displayName ?? "de la familia"}`}
                                      onClick={() => {
                                        setEditingPayer({
                                          familyPayerId: payer.familyPayerId,
                                          profileVersion: payer.profileVersion,
                                        });
                                        setPayerForm({
                                          givenName: payer.givenName,
                                          familyName: payer.familyName,
                                        });
                                        setPayerSaveState("idle");
                                        setPayerSaveMessage("");
                                      }}
                                    >
                                      Editar nombre
                                    </button>
                                  ) : null}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="mt-2 text-sm text-amber-900">
                              Falta asignar un responsable para facturar.
                            </p>
                          )}
                          {canManageBilling &&
                          editingPayer &&
                          family.payers.some(
                            (payer) =>
                              payer.familyPayerId === editingPayer.familyPayerId
                          ) ? (
                            <form
                              className="mt-3 grid gap-3 rounded-xl border border-teal-200 bg-teal-50 p-3"
                              onSubmit={savePayerProfile}
                              aria-label="Editar datos del responsable"
                            >
                              <label className="grid gap-1 text-sm font-semibold">
                                Nombre
                                <input
                                  autoComplete="given-name"
                                  required
                                  maxLength={100}
                                  value={payerForm.givenName}
                                  onChange={(event) =>
                                    setPayerForm((current) => ({
                                      ...current,
                                      givenName: event.target.value,
                                    }))
                                  }
                                  className="min-h-10 rounded-lg border border-slate-300 bg-white px-3"
                                />
                              </label>
                              <label className="grid gap-1 text-sm font-semibold">
                                Apellidos
                                <input
                                  autoComplete="family-name"
                                  required
                                  maxLength={100}
                                  value={payerForm.familyName}
                                  onChange={(event) =>
                                    setPayerForm((current) => ({
                                      ...current,
                                      familyName: event.target.value,
                                    }))
                                  }
                                  className="min-h-10 rounded-lg border border-slate-300 bg-white px-3"
                                />
                              </label>
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="submit"
                                  disabled={payerSaveState === "saving"}
                                  className="min-h-10 rounded-full bg-teal-800 px-4 text-sm font-bold text-white disabled:opacity-60"
                                >
                                  {payerSaveState === "saving"
                                    ? "Guardando…"
                                    : "Guardar nombre"}
                                </button>
                                <button
                                  type="button"
                                  className="min-h-10 rounded-full border border-slate-400 bg-white px-4 text-sm font-semibold"
                                  onClick={() => setEditingPayer(null)}
                                >
                                  Cancelar
                                </button>
                              </div>
                            </form>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}
        {payerSaveMessage ? (
          <p
            role="status"
            className={
              payerSaveState === "error"
                ? "text-sm font-semibold text-red-800"
                : "text-sm font-semibold text-teal-900"
            }
          >
            {payerSaveMessage}
          </p>
        ) : null}
        {familyLifecycleMessage ? (
          <p
            role={familyLifecycleState === "error" ? "alert" : "status"}
            className={
              familyLifecycleState === "error"
                ? "text-sm font-semibold text-red-800"
                : "text-sm font-semibold text-teal-900"
            }
          >
            {familyLifecycleMessage}
          </p>
        ) : null}
      </div>
    </main>
  );
}
