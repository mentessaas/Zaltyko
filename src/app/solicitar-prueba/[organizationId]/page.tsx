import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PublicTrialRequestForm } from "@/components/admissions/PublicTrialRequestForm";
import { getPublicAdmissionTarget } from "@/modules/admissions/application/admission-requests";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Solicitar una clase de prueba | Zaltyko",
  description: "Pide a la academia una clase de prueba para tu gimnasta.",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/**
 * Enlace público que la academia comparte desde «Solicitudes» en /owner
 * (P2 #15). Solo muestra el nombre de la academia y sus sedes activas.
 */
export default async function TrialRequestPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { organizationId } = await params;
  const target = await getPublicAdmissionTarget(organizationId);
  if (!target) notFound();

  const raw = await searchParams;
  const requestedLocation = typeof raw.sede === "string" ? raw.sede.toLowerCase() : null;
  const initialLocationId =
    target.locations.find((location) => location.id === requestedLocation)?.id ??
    (target.locations.length === 1 ? target.locations[0]!.id : null);
  const receiving = target.available && target.locations.length > 0;

  return (
    <main className="min-h-screen bg-z-canvas px-4 py-10 text-z-ink sm:py-16">
      <div className="mx-auto w-full max-w-xl">
        <p className="floor-label text-z-soft">Clase de prueba</p>
        <h1 className="mt-2 break-words font-display text-3xl font-black uppercase leading-none [overflow-wrap:anywhere] sm:text-4xl">
          {target.organizationName}
        </h1>
        {receiving ? (
          <>
            <p className="mt-3 text-base leading-7 text-z-soft">
              Déjanos tus datos y la academia se pondrá en contacto contigo para
              proponerte un día. No hace falta crear una cuenta.
            </p>
            <div className="mt-8 rounded-xl border border-z-line border-t-[3px] border-t-z-ink bg-white p-5 sm:p-6">
              <PublicTrialRequestForm
                organizationId={target.organizationId}
                organizationName={target.organizationName}
                locations={target.locations}
                initialLocationId={initialLocationId}
              />
            </div>
          </>
        ) : (
          <p role="status" className="mt-6 rounded-md border border-z-line bg-white p-4 text-sm leading-6 text-z-ink">
            Esta academia todavía no recibe solicitudes en línea. Ponte en
            contacto con ella por sus canales habituales.
          </p>
        )}
        <p className="mt-8 text-xs leading-5 text-z-soft">
          Formulario gestionado con Zaltyko por cuenta de la academia.{" "}
          <Link href="/politica-privacidad" className="font-semibold text-z-brand-700 underline">
            Política de privacidad
          </Link>
        </p>
      </div>
    </main>
  );
}
