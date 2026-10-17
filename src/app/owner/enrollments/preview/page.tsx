import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { OwnerEnrollmentsManager } from "@/components/owner-dashboard/OwnerEnrollmentsManager";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Vista de ejemplo: inscripciones | Zaltyko",
  description: "Vista de ejemplo con datos sintéticos y acciones desactivadas.",
  robots: { index: false, follow: false },
};

const organizationId = "20000000-0000-0000-0000-000000000001";
const locationA = "20000000-0000-0000-0000-000000000011";
const locationB = "20000000-0000-0000-0000-000000000012";
const programRhythmic = "20000000-0000-0000-0000-000000000021";
const programArtistic = "20000000-0000-0000-0000-000000000022";
const classTemplateRhythmic = "20000000-0000-0000-0000-000000000031";
const classTemplateArtistic = "20000000-0000-0000-0000-000000000032";

const syntheticBundle: Parameters<typeof OwnerEnrollmentsManager>[0]["bundle"] =
  {
    organization: {
      id: organizationId,
      name: "Academia de ejemplo",
      defaultCurrency: "EUR",
    },
    member: {
      id: "20000000-0000-0000-0000-000000000041",
      role: "owner",
      locationScopeMode: "all",
    },
    locations: [
      { id: locationA, name: "Sede Centro", timezone: "Europe/Madrid" },
      { id: locationB, name: "Sede Norte", timezone: "Europe/Madrid" },
    ],
    programs: [
      {
        id: programRhythmic,
        name: "Gimnasia rítmica",
        kind: "gymnastics_sport",
      },
      {
        id: programArtistic,
        name: "Gimnasia artística",
        kind: "gymnastics_sport",
      },
    ],
    classes: [
      {
        id: classTemplateRhythmic,
        name: "Iniciación con cinta",
        locationId: locationA,
        locationName: "Sede Centro",
        programId: programRhythmic,
        programName: "Gimnasia rítmica",
        programKind: "gymnastics_sport",
        capacity: 12,
        spaceCapacity: null,
        effectiveFrom: "2026-09-01",
        effectiveTo: null,
        occupied: 9,
        availableSeats: 3,
      },
      {
        id: classTemplateArtistic,
        name: "Pre-equipo",
        locationId: locationB,
        locationName: "Sede Norte",
        programId: programArtistic,
        programName: "Gimnasia artística",
        programKind: "gymnastics_sport",
        capacity: 10,
        spaceCapacity: null,
        effectiveFrom: "2026-09-01",
        effectiveTo: null,
        occupied: 8,
        availableSeats: 2,
      },
    ],
    enrollments: [
      {
        id: "20000000-0000-0000-0000-000000000051",
        athleteId: "20000000-0000-0000-0000-000000000061",
        givenName: "Gimnasta",
        preferredName: null,
        familyName: "Ejemplo A",
        athleteName: "Gimnasta Ejemplo A",
        status: "active",
        startsOn: "2026-09-01",
        endsOn: null,
        version: 2,
        classTemplateId: classTemplateRhythmic,
        className: "Iniciación con cinta",
        locationId: locationA,
        locationName: "Sede Centro",
        programName: "Gimnasia rítmica",
      },
      {
        id: "20000000-0000-0000-0000-000000000052",
        athleteId: "20000000-0000-0000-0000-000000000062",
        givenName: "Gimnasta",
        preferredName: null,
        familyName: "Ejemplo B",
        athleteName: "Gimnasta Ejemplo B",
        status: "pending",
        startsOn: "2026-10-20",
        endsOn: null,
        version: 1,
        classTemplateId: classTemplateArtistic,
        className: "Pre-equipo",
        locationId: locationB,
        locationName: "Sede Norte",
        programName: "Gimnasia artística",
      },
      {
        id: "20000000-0000-0000-0000-000000000053",
        athleteId: "20000000-0000-0000-0000-000000000063",
        givenName: "Gimnasta",
        preferredName: null,
        familyName: "Ejemplo C",
        athleteName: "Gimnasta Ejemplo C",
        status: "paused",
        startsOn: "2026-07-01",
        endsOn: null,
        version: 3,
        classTemplateId: classTemplateRhythmic,
        className: "Iniciación con cinta",
        locationId: locationA,
        locationName: "Sede Centro",
        programName: "Gimnasia rítmica",
      },
    ],
    totalsByStatus: { active: 1, pending: 1, paused: 1 },
    total: 3,
    page: 1,
    pages: 1,
    pageSize: 50,
    selectedLocationId: locationA,
    localTodayByLocation: {
      [locationA]: "2026-10-13",
      [locationB]: "2026-10-13",
    },
    filterLocationId: null,
  };

export default async function OwnerEnrollmentsPreviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.VERCEL_ENV !== "preview"
  ) {
    notFound();
  }
  const raw = await searchParams;
  const previewCreateForm = raw.view === "create";
  return (
    <>
      <nav
        aria-label="Vistas de ejemplo"
        className="flex flex-wrap gap-3 bg-slate-100 px-4 py-3 sm:px-6 lg:px-10"
      >
        <Link
          href="/owner/enrollments/preview"
          aria-current={previewCreateForm ? undefined : "page"}
          className="touch-target inline-flex min-h-11 items-center px-3 text-sm font-semibold text-teal-900 underline underline-offset-4"
        >
          Lista de inscripciones
        </Link>
        <Link
          href="/owner/enrollments/preview?view=create"
          aria-current={previewCreateForm ? "page" : undefined}
          className="touch-target inline-flex min-h-11 items-center px-3 text-sm font-semibold text-teal-900 underline underline-offset-4"
        >
          Formulario de ejemplo
        </Link>
      </nav>
      <OwnerEnrollmentsManager
        key={previewCreateForm ? "form" : "list"}
        bundle={syntheticBundle}
        selectedStatus="all"
        previewMode
        previewCreateForm={previewCreateForm}
      />
    </>
  );
}
