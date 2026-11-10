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

  return (
    <main className="min-h-screen bg-z-canvas px-4 py-10 text-z-ink sm:py-16">
      <div className="mx-auto w-full max-w-xl">
        <p className="floor-label text-z-soft">Clase de prueba</p>
        <h1 className="mt-2 break-words font-display text-3xl font-black uppercase leading-none [overflow-wrap:anywhere] sm:text-4xl">
          {target.organizationName}
        </h1>
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
          <Link href="/politica-privacidad" className="font-semibold text-z-brand-700 underline">
            Política de privacidad
          </Link>
        </p>
      </div>
    </main>
  );
}
