import Link from "next/link";
import { DirectoryMeasurement } from "./DirectoryMeasurement";
import { DirectoryActions } from "./DirectoryActions";
import {
  type DirectoryEntry,
  entryPath,
  flag,
} from "@/lib/directory/contracts";
import { Schema } from "@/components/Schema";
import { eventJsonLd } from "@/lib/seo/event-schema";
import { getPublicSiteUrl } from "@/lib/seo/site-url";
export function DirectoryDetail({ entry }: { entry: DirectoryEntry }) {
  const d = entry.data,
    isEvent = entry.kind === "event",
    schema = isEvent
      ? eventJsonLd({
          baseUrl: getPublicSiteUrl(),
          pagePath: entryPath(entry),
          title: d.name,
          description: d.description,
          startDate: d.startDate ?? null,
          endDate: d.endDate,
          cityName: d.city,
          countryName: d.countryCode,
          provinceName: d.region,
          imageUrl: d.imageUrl,
          organizerName: d.organizerName,
          organizerUrl: d.organizerUrl,
          eventStatus: d.eventStatus,
        })
      : entry.kind === "academy"
        ? {
            "@context": "https://schema.org",
            "@type": "SportsActivityLocation",
            "@id": `${getPublicSiteUrl()}${entryPath(entry)}#academy`,
            name: d.name,
            url: `${getPublicSiteUrl()}${entryPath(entry)}`,
            description: d.description || undefined,
            address: {
              "@type": "PostalAddress",
              streetAddress: d.address || undefined,
              addressLocality: d.city || undefined,
              addressRegion: d.region || undefined,
              addressCountry: d.countryCode,
            },
            sameAs: [d.website, d.socialInstagram, d.socialFacebook].filter(
              Boolean
            ),
          }
        : null;
  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-12">
      <DirectoryMeasurement id={entry.id} kind={entry.kind} />
      <Link href={isEvent ? "/events" : "/academias"}>
        ← Volver al catálogo
      </Link>
      <header>
        <h1 className="text-3xl font-bold">{d.name}</h1>
        <p className="mt-3">
          {d.city} · {d.region} · {d.countryName ?? d.countryCode}
        </p>
        <p>
          {entry.representation === "verified"
            ? "Representante verificado"
            : "Sin representante verificado"}
        </p>
      </header>
      {d.imageUrl && d.imageSourceUrl && d.imageLicense && (
        <figure>
          <img
            src={d.imageUrl}
            alt={`Imagen autorizada de ${d.name}`}
            className="max-h-72 w-full rounded-lg object-contain"
            referrerPolicy="no-referrer"
          />
          <figcaption className="text-sm">
            <a href={d.imageSourceUrl} className="underline">
              Procedencia de la imagen
            </a>{" "}
            · {d.imageLicense}
          </figcaption>
        </figure>
      )}
      <p className="whitespace-pre-wrap">{d.description}</p>
      {isEvent && (
        <section className="space-y-3 rounded-xl border p-5">
          <h2 className="text-xl font-semibold">Información del evento</h2>
          <p>
            Situación:{" "}
            {
              {
                provisional: "Provisional",
                confirmed: "Confirmado",
                postponed: "Aplazado",
                cancelled: "Cancelado",
                finished: "Finalizado",
              }[d.eventStatus]
            }
          </p>
          <p>
            Fecha: {d.startDate ?? "Sin confirmar"}
            {d.endDate ? ` al ${d.endDate}` : ""}
            {d.startTime
              ? ` · ${d.startTime} (${d.timezone})`
              : " · Hora sin confirmar"}
          </p>
          <p>Organiza: {d.organizerName}</p>
          <p>Recinto: {d.venue ?? "Sin confirmar"}</p>
          <p>
            Requisitos para competir:{" "}
            {d.participantRequirements ?? "Consulta al organizador"}
          </p>
          <p>
            Espectadores:{" "}
            {
              {
                public: "Acceso público",
                restricted: "Acceso restringido",
                unknown: "Sin confirmar",
              }[d.spectatorAccess]
            }
          </p>
          {d.registrationUrl && (
            <a
              className="underline"
              data-directory-action="organizer"
              href={d.registrationUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Información e inscripción en la web oficial
            </a>
          )}
          {d.eventStatus === "confirmed" && (
            <p>
              <a
                href={`/api/directory/calendar/${entry.id}`}
                className="underline"
              >
                Añadir al calendario
              </a>
            </p>
          )}
          <p className="text-sm">
            Zaltyko publica información. Las inscripciones externas y sus
            condiciones dependen del organizador.
          </p>
        </section>
      )}
      <section>
        <h2 className="text-xl font-semibold">Canales oficiales</h2>
        <p>{d.address}</p>
        {d.website && (
          <p>
            <a
              className="underline"
              href={d.website}
              target="_blank"
              rel="noopener noreferrer"
            >
              Web oficial
            </a>
          </p>
        )}
        {d.contactEmail && <p>{d.contactEmail}</p>}
        {d.contactPhone && <p>{d.contactPhone}</p>}
        {d.hours && <p>Horarios: {d.hours}</p>}
      </section>
      <section className="rounded-xl bg-muted p-5">
        <a
          className="underline"
          href={d.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          Fuente: {d.sourceName}
        </a>
        <p>
          Última revisión:{" "}
          {entry.reviewedAt
            ? new Date(entry.reviewedAt).toLocaleDateString("es-ES")
            : "Pendiente"}
        </p>
        {entry.reviewedAt &&
          Date.now() - Date.parse(entry.reviewedAt) > 90 * 86400000 && (
            <p>
              Esta información puede haber cambiado. Comprueba el canal oficial.
            </p>
          )}
      </section>
      <DirectoryActions
        id={entry.id}
        claimsEnabled={flag("claims")}
        operational={Boolean(entry.academyId || entry.eventId)}
        event={isEvent}
      />
      <Link className="underline" href="/recursos/kit-academias">
        Descargar el kit gratuito de organización
      </Link>
      {schema && <Schema json={schema} />}
    </div>
  );
}
