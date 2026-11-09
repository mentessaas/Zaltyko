import Link from "next/link";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";

interface FeatureUnavailableStateProps {
  title: string;
  description: string;
  backHref: string;
  backLabel?: string;
}

/**
 * Pantalla de función aún no disponible, con la misma cabecera que el resto
 * de la app. El estado va en la línea de descripción, no en un antetítulo.
 */
export function FeatureUnavailableState({
  title,
  description,
  backHref,
  backLabel = "Volver",
}: FeatureUnavailableStateProps) {
  return (
    <div className="mx-auto max-w-[1500px] space-y-6">
      <PageHeader title={title} description={`Disponible más adelante. ${description}`} />
      <Button asChild variant="outline">
        <Link href={backHref}>{backLabel}</Link>
      </Button>
    </div>
  );
}
