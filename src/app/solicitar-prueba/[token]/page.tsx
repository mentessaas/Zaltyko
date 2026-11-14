import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PublicTrialRequestForm } from "@/components/admissions/PublicTrialRequestForm";
import { ZaltykoLockup } from "@/components/brand/ZaltykoMark";
import { getPublicAdmissionTarget } from "@/modules/admissions/application/admission-requests";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Solicitar una clase de prueba | Zaltyko",
  description: "Pide a la academia una clase de prueba para tu gimnasta.",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/**
 * Enlace público que la academia activa y comparte desde «Solicitudes» en
 * /owner (P2 #15). Un enlace desconocido, desactivado o revocado da el mismo
 * 404. Solo muestra el nombre de la academia y las sedes activas del enlace.
 */
export default async function TrialRequestPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const target = await getPublicAdmissionTarget(token);
  if (!target) notFound();

  // Banda de tapiz con el lockup, como la barra pública, y debajo el
  // formulario en un panel reglado sobre magnesio. Legible en móvil.
  return (
    <div className="min-h-screen bg-z-canvas text-z-ink">
      <header className="mat-field-deep border-b border-white/10 text-white">
        <div className="mx-auto flex min-h-14 w-full max-w-xl items-center px-4">
          <ZaltykoLockup markClassName="h-7 w-7" />
        </div>
      </header>
      <main className="px-4 py-8 sm:py-12">
        <div className="mx-auto w-full max-w-xl">
          <h1 className="break-words border-b-[3px] border-z-ink pb-3 font-display text-3xl font-black uppercase leading-[0.95] [overflow-wrap:anywhere] [text-wrap:balance] sm:text-4xl">
            {target.organizationName}
          </h1>
          {/* Qué se pide, como rótulo del bloque bajo el título, no antetítulo. */}
          <p className="floor-label mt-2 text-ramp-600">Clase de prueba</p>
          <p className="mt-3 text-base leading-7 text-z-soft">
            Déjanos tus datos y la academia se pondrá en contacto contigo para
            proponerte un día. No hace falta crear una cuenta.
          </p>
          <div className="mt-8 rounded-xl border border-z-line border-t-[3px] border-t-z-ink bg-white p-5 sm:p-6">
            <PublicTrialRequestForm
              linkToken={token.toLowerCase()}
              organizationName={target.organizationName}
              locations={target.locations}
            />
          </div>
          <p className="mt-8 text-xs leading-5 text-z-soft">
            Formulario gestionado con Zaltyko por cuenta de la academia.{" "}
            <Link href="/politica-privacidad" className="font-semibold text-mat underline underline-offset-2">
              Política de privacidad
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
