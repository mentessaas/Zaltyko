import { Button } from "@/components/ui/button";

interface DashboardRefreshNoticeProps {
  error: string;
  loading: boolean;
  onRetry: () => void;
}

export function DashboardRefreshNotice({ error, loading, onRetry }: DashboardRefreshNoticeProps) {
  return (
    <section
      className="flex flex-col gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950 sm:flex-row sm:items-center sm:justify-between dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
      role="alert"
      aria-live="assertive"
    >
      <div>
        <p className="font-semibold">{error}</p>
        <p className="text-sm">Seguimos mostrando la última información disponible.</p>
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={onRetry}
        disabled={loading}
        aria-busy={loading}
      >
        {loading ? "Actualizando…" : "Reintentar"}
      </Button>
    </section>
  );
}
