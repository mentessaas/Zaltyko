import Link from "next/link";
import { listEntries } from "@/lib/directory/service";
import {
  flag,
  QuerySchema,
  entryPath,
  type DirectoryKind,
} from "@/lib/directory/contracts";
import { SubscriptionForm } from "./SubscriptionForm";
export async function DirectoryBrowse({
  kind,
  params,
}: {
  kind: DirectoryKind;
  params: Record<string, string | undefined>;
}) {
  const parsed = QuerySchema.safeParse({ ...params, kind });
  const query = parsed.success ? parsed.data : QuerySchema.parse({ kind });
  const result = await listEntries(query),
    path = kind === "event" ? "/events" : "/academias";
  const pageLink = (page: number) => {
    const search = new URLSearchParams();
    for (const [k, v] of Object.entries(params))
      if (v && k !== "page") search.set(k, v);
    search.set("page", String(page));
    return `${path}?${search}`;
  };
  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-12">
      <header>
        <h1 className="text-3xl font-bold">
          {kind === "event"
            ? "Competiciones y eventos de gimnasia"
            : "Academias de gimnasia"}
        </h1>
        <p className="mt-3 text-muted-foreground">
          España y Latinoamérica. Información pública revisada; la cobertura
          crece con las fuentes disponibles.
        </p>
        <nav className="mt-4 flex flex-wrap gap-5">
          <Link href="/academias">Academias</Link>
          <Link href="/events">Eventos</Link>
          <Link href="/directorio/mis-fichas">Mis fichas y favoritos</Link>
          <Link href="/recursos/kit-academias">Kit gratuito</Link>
          <Link href="/directorio/proponer">Proponer una ficha</Link>
        </nav>
      </header>
      <form className="grid gap-3 rounded-xl border p-4 sm:grid-cols-3">
        <label>
          Buscar
          <input
            name="search"
            defaultValue={params.search}
            className="block w-full rounded border p-2"
          />
        </label>
        <label>
          País
          <select
            name="country"
            defaultValue={params.country ?? ""}
            className="block w-full rounded border p-2"
          >
            <option value="">Todos los países</option>
            {Object.entries({
              ES: "España",
              AR: "Argentina",
              BO: "Bolivia",
              BR: "Brasil",
              CL: "Chile",
              CO: "Colombia",
              CR: "Costa Rica",
              CU: "Cuba",
              DO: "República Dominicana",
              EC: "Ecuador",
              SV: "El Salvador",
              GT: "Guatemala",
              HT: "Haití",
              HN: "Honduras",
              MX: "México",
              NI: "Nicaragua",
              PA: "Panamá",
              PY: "Paraguay",
              PE: "Perú",
              PR: "Puerto Rico",
              UY: "Uruguay",
              VE: "Venezuela",
            }).map(([code, name]) => (
              <option value={code} key={code}>
                {name}
              </option>
            ))}
          </select>
        </label>
        {["region", "city"].map((key) => (
          <label key={key}>
            {key === "region" ? "Región" : "Localidad"}
            <input
              name={key}
              defaultValue={params[key]}
              className="block w-full rounded border p-2"
            />
          </label>
        ))}
        <label>
          Modalidad
          <select
            name="discipline"
            defaultValue={params.discipline ?? ""}
            className="block w-full rounded border p-2"
          >
            <option value="">Todas</option>
            {Object.entries({
              artistic_female: "Artística femenina",
              artistic_male: "Artística masculina",
              rhythmic: "Rítmica",
              trampoline: "Trampolín",
              aerobic: "Aeróbica",
              acrobatics: "Acrobática",
              parkour: "Parkour",
              general: "General",
            }).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        {kind === "event" && (
          <>
            <label>
              Desde
              <input
                type="date"
                name="startDate"
                defaultValue={params.startDate}
                className="block w-full rounded border p-2"
              />
            </label>
            <label>
              Hasta
              <input
                type="date"
                name="endDate"
                defaultValue={params.endDate}
                className="block w-full rounded border p-2"
              />
            </label>
            <label>
              Tipo
              <select
                name="eventType"
                defaultValue={params.eventType ?? ""}
                className="block w-full rounded border p-2"
              >
                <option value="">Todos</option>
                {Object.entries({
                  competitions: "Competiciones",
                  courses: "Cursos",
                  camps: "Campus",
                  workshops: "Talleres",
                  clinics: "Clínics",
                  evaluations: "Evaluaciones",
                  other: "Otros",
                }).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <input
                type="checkbox"
                name="history"
                value="true"
                defaultChecked={params.history === "true"}
              />{" "}
              Consultar histórico
            </label>
          </>
        )}
        <button className="rounded bg-primary p-2 text-primary-foreground">
          Buscar
        </button>
        <p className="text-sm sm:col-span-3">
          «Cerca de ti» filtra por localidad y región elegidas. No calcula
          distancias.
        </p>
      </form>
      <p>{result.total} fichas disponibles con estos filtros</p>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {result.items.map((entry) => (
          <article key={entry.id} className="rounded-xl border bg-card p-5">
            <h2 className="text-xl font-semibold">
              <Link href={entryPath(entry)}>{entry.data.name}</Link>
            </h2>
            <p>
              {entry.data.city} · {entry.data.countryCode}
            </p>
            {kind === "event" && (
              <p>
                {entry.data.startDate} ·{" "}
                {entry.data.eventStatus === "cancelled"
                  ? "Cancelado"
                  : entry.data.eventStatus === "postponed"
                    ? "Aplazado"
                    : entry.data.eventStatus === "provisional"
                      ? "Provisional"
                      : "Confirmado"}
              </p>
            )}
            <p className="mt-3 line-clamp-3">{entry.data.description}</p>
            <p className="mt-3 text-sm">
              {entry.representation === "verified"
                ? "Representante verificado"
                : "Sin representante verificado"}
            </p>
            <p className="text-sm text-muted-foreground">
              Fuente: {entry.data.sourceName}
            </p>
          </article>
        ))}
      </div>
      {!result.items.length && (
        <p>
          No hay fichas revisadas con estos filtros. Puedes{" "}
          <Link className="underline" href="/directorio/proponer">
            proponer una
          </Link>
          .
        </p>
      )}
      <nav aria-label="Paginación" className="flex gap-6">
        {result.hasPreviousPage && (
          <Link href={pageLink(result.page - 1)}>Anterior</Link>
        )}
        {result.hasNextPage && (
          <Link href={pageLink(result.page + 1)}>Siguiente</Link>
        )}
      </nav>
      {kind === "event" && flag("communications") && (
        <SubscriptionForm
          purpose="calendar"
          filters={{
            ...(params.country ? { country: params.country } : {}),
            ...(params.city ? { city: params.city } : {}),
            ...(params.discipline ? { discipline: params.discipline } : {}),
          }}
        />
      )}
    </div>
  );
}
