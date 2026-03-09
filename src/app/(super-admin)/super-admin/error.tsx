"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function SuperAdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Super Admin error:", error);
  }, [error]);

  return (
    <div className="flex h-[450px] shrink-0 items-center justify-center rounded-md border border-dashed">
      <div className="flex flex-col items-center gap-4 text-center">
        <h3 className="text-2xl font-bold tracking-tight">Error del Sistema</h3>
        <p className="text-sm text-muted-foreground">
          {error.message || "Ha ocurrido un error inesperado en el panel de administración."}
        </p>
        <Button onClick={reset}>Intentar de nuevo</Button>
      </div>
    </div>
  );
}
