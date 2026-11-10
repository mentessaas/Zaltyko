"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export const dateTime = new Intl.DateTimeFormat("es-ES", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Madrid",
});

export function useSaver() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(action: () => Promise<unknown>, after?: () => void) {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await action();
      router.refresh();
      after?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }
  return { saving, error, run };
}

export function ErrorLine({ error }: { error: string | null }) {
  return error ? (
    <p role="alert" className="text-sm text-rose-200">
      {error}
    </p>
  ) : null;
}
