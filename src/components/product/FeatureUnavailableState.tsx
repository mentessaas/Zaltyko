import Link from "next/link";

import { Button } from "@/components/ui/button";

interface FeatureUnavailableStateProps {
  title: string;
  description: string;
  backHref: string;
  backLabel?: string;
}

export function FeatureUnavailableState({
  title,
  description,
  backHref,
  backLabel = "Volver",
}: FeatureUnavailableStateProps) {
  return (
    <div className="mx-auto flex min-h-[50vh] max-w-2xl flex-col items-start justify-center gap-5 rounded-xl border bg-card p-8 shadow-sm">
      <div className="space-y-2">
        <p className="text-sm font-medium uppercase tracking-wide text-primary">Disponible más adelante</p>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">{title}</h1>
        <p className="text-base text-muted-foreground">{description}</p>
      </div>
      <Button asChild>
        <Link href={backHref}>{backLabel}</Link>
      </Button>
    </div>
  );
}
