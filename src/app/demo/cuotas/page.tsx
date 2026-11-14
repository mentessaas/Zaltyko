import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { DemoStepper } from "@/components/demo/DemoStepper";
import { ManualPaymentForm } from "@/components/owner-dashboard/ManualPaymentForm";
import { OwnerWorkspacePageShell } from "@/components/owner-dashboard/OwnerWorkspacePageShell";
import { ownerUi } from "@/components/owner-dashboard/owner-ui";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/utils";
import {
  DEMO_ACTOR_ID,
  DEMO_ORGANIZATION_ID,
  DEMO_ORGANIZATION_NAME,
  demoOpenCharges,
} from "@/modules/demo/demo-fixtures";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Cobros · Demo de Zaltyko" };

export default function DemoPaymentsPage() {
  return (
    <OwnerWorkspacePageShell
      demo
      organizationId={DEMO_ORGANIZATION_ID}
      organizationName={DEMO_ORGANIZATION_NAME}
      locationId={null}
    >
      <main className={ownerUi.page}>
        <div className="mx-auto grid max-w-4xl gap-8">
          <div className="grid gap-5">
            <Link href="/demo" className={cn(ownerUi.backLink, "w-fit")}>
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Volver al resumen
            </Link>
            <PageHeader
              title="Registrar un pago recibido"
              description="Anota una transferencia, efectivo o pago en el local. Al guardar, Zaltyko lo apunta en su cuota y resta lo que falta."
            />
          </div>

          <ManualPaymentForm
            actorId={DEMO_ACTOR_ID}
            organizationId={DEMO_ORGANIZATION_ID}
            locationId={null}
            charges={demoOpenCharges(new Date())}
            nextCursor={null}
          />
        </div>
      </main>
      <DemoStepper current="cuotas" />
    </OwnerWorkspacePageShell>
  );
}
