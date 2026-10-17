import { notFound } from "next/navigation";

import { OwnerSetupForm } from "@/components/owner-dashboard/OwnerSetupForm";

export default function OwnerSetupPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main className="grid min-h-screen place-items-center bg-[#F1F3EF] px-5 py-12 text-slate-950">
      <section className="w-full max-w-2xl border-t-4 border-teal-800 bg-white p-7 shadow-soft sm:p-10">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-800">
          Tu academia
        </p>
        <h1 className="mt-3 text-4xl tracking-[-0.04em]">Crea tu academia</h1>
        <p className="mt-4 max-w-xl leading-7 text-slate-600">
          Indica el nombre, la sede y las actividades. Después podrás añadir
          gimnastas, clases y cuotas.
        </p>
        <p
          role="status"
          className="mt-6 border-l-4 border-amber-500 bg-amber-50 p-4 text-sm leading-6 text-amber-950"
        >
          Vista previa con datos sintéticos. No se creará ninguna academia ni se
          guardará tu aceptación de los términos.
        </p>
        <OwnerSetupForm
          contractualConsent={{
            policyVersion: "preview-synthetic",
            requiresAcceptance: true,
          }}
          previewOnly
        />
      </section>
    </main>
  );
}
