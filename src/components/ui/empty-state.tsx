import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
  secondaryAction?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        // Estado vacío de lista: cinta blanca con borde discontinuo de 2 px en
        // `ramp-300`, 12 px de radio y 48 px de relleno, sin sombra.
        "flex flex-col items-center rounded-xl border-2 border-dashed border-ramp-300 bg-white p-12 text-center",
        className
      )}
    >
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-md bg-mat-wash">
        <Icon className="h-5 w-5 text-mat" aria-hidden />
      </div>
      <p className="mb-2 text-base font-semibold text-mat-night">{title}</p>
      <p className="mb-6 max-w-sm text-sm text-ramp-600">{description}</p>
      {(action || secondaryAction) && (
        <div className="flex flex-col gap-2 sm:flex-row">
          {action}
          {secondaryAction}
        </div>
      )}
    </div>
  );
}
