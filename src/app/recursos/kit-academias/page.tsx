import Link from "next/link";
import { getPublicSiteUrl } from "@/lib/seo/site-url";
import { DirectoryMeasurement } from "@/components/directory/DirectoryMeasurement";
import { SubscriptionForm } from "@/components/directory/SubscriptionForm";
import { flag } from "@/lib/directory/contracts";
export const metadata = {
  alternates: {canonical: `${getPublicSiteUrl()}/recursos/kit-academias`},
  title: "Kit gratuito de organización de academias | Zaltyko",
  description:
    "Plantillas de cuotas y asistencia, checklist de temporada y guía de gestión para academias de gimnasia.",
};
export default async function Page({searchParams}:{searchParams:Promise<{directoryEntryId?:string}>}) {
  const {directoryEntryId}=await searchParams;
  const originEntryId=directoryEntryId && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(directoryEntryId) ? directoryEntryId : undefined;
  return (
    <main className="mx-auto max-w-3xl space-y-7 px-4 py-12">
      <DirectoryMeasurement id="kit" kind="resource" originEntryId={originEntryId} />
      <h1 className="text-3xl font-bold">
        Kit de organización de academias de gimnasia
      </h1>
      <p>
        Descarga gratuita, sin contratar ni reclamar una ficha. Los ejemplos son
        ficticios: sustituye las referencias por las de tu academia y protege
        los datos de las familias.
      </p>
      <ul className="space-y-4">
        {[
          ["cuotas-pendientes.csv", "Plantilla de cuotas pendientes (CSV)"],
          ["control-asistencia.csv", "Control de asistencia (CSV)"],
          ["checklist-temporada.md", "Checklist de inicio de temporada"],
          ["guia-gestion.md", "Guía para centralizar la gestión"],
        ].map(([file, label]) => (
          <li key={file}>
            <a
              className="underline"
              href={`/recursos/kit-academias/${file}`}
              data-directory-action="kit"
              download
            >
              {label}
            </a>
          </li>
        ))}
      </ul>
      <p>
        Las plantillas CSV se abren en Excel o Google Sheets. Las guías son
        archivos de texto; puedes guardarlas o imprimirlas.
      </p>
      {flag("communications") && <SubscriptionForm purpose="kit" />}
      <Link href="/academias" className="underline">
        Consultar academias
      </Link>
    </main>
  );
}
