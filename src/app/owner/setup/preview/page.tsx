import { notFound } from "next/navigation";

import { OwnerSetupForm } from "@/components/owner-dashboard/OwnerSetupForm";
import { OwnerWorkspacePageShell } from "@/components/owner-dashboard/OwnerWorkspacePageShell";
import { ownerUi } from "@/components/owner-dashboard/owner-ui";
import { PageHeader } from "@/components/ui/page-header";

export default function OwnerSetupPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <OwnerWorkspacePageShell previewMode>
      <main className="grid min-h-screen place-items-center bg-z-canvas px-5 py-12 text-z-ink">
        <section className="w-full max-w-2xl rounded-xl border border-z-line bg-white p-7 sm:p-10">
          <PageHeader
            title="Crea tu academia"
            description="Indica el nombre, la sede y las actividades. Después podrás añadir gimnastas, clases y cuotas."
            className="border-b-0 pb-0"
          />
          <p
            role="status"
            className={`mt-6 ${ownerUi.noticeWarning}`}
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
    </OwnerWorkspacePageShell>
  );
}
