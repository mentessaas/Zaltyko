"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function LegacyWorkspaceRedirect({ targetUrl }: { targetUrl: string }) {
  const router = useRouter();

  useEffect(() => {
    router.replace(targetUrl);
  }, [router, targetUrl]);

  return (
    <div className="flex min-h-[45vh] items-center justify-center" aria-live="polite">
      <p className="text-sm text-muted-foreground">Abriendo tu espacio de trabajo…</p>
    </div>
  );
}
