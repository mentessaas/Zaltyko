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
        "flex flex-col items-center rounded-2xl border border-zaltyko-mist bg-white p-12 text-center shadow-soft",
        className
      )}
    >
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-zaltyko-teal/10">
        <Icon className="h-8 w-8 text-zaltyko-teal" aria-hidden />
      </div>
      <p className="mb-2 text-sm font-medium text-foreground">{title}</p>
      <p className="mb-6 max-w-sm text-sm text-muted-foreground">{description}</p>
      {(action || secondaryAction) && (
        <div className="flex flex-col gap-2 sm:flex-row">
          {action}
          {secondaryAction}
        </div>
      )}
    </div>
  );
}
