"use client";

import { useEffect, useState } from "react";
import { BookOpen, Loader2 } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface PopularClassesWidgetProps {
  academyId: string;
}

type AcademyClass = { id: string; name: string; startTime?: string | null; endTime?: string | null; capacity?: number | null };

export function PopularClassesWidget({ academyId }: PopularClassesWidgetProps) {
  const [classes, setClasses] = useState<AcademyClass[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetch(`/api/classes?academyId=${encodeURIComponent(academyId)}`, { signal: controller.signal, credentials: "include" })
      .then(async (response) => {
        if (!response.ok) throw new Error("class_load_failed");
        const payload = await response.json();
        return Array.isArray(payload?.data?.items) ? payload.data.items : [];
      })
      .then((items: AcademyClass[]) => setClasses(items.slice(0, 4)))
      .catch(() => { if (!controller.signal.aborted) setClasses([]); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [academyId]);

  return (
    <Card className="border-border/80 shadow-soft">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-display font-semibold">
          <BookOpen className="h-5 w-5 text-zaltyko-indigo dark:text-zaltyko-electric" />
          Clases de la academia
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading ? (
          <div className="flex items-center justify-center py-6 text-sm text-muted-foreground" aria-live="polite">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> Cargando clases…
          </div>
        ) : classes.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">Aún no hay clases configuradas.</p>
        ) : classes.map((cls, index) => (
          <div
            key={cls.id}
            className="flex items-center justify-between rounded-xl bg-muted/40 p-3 transition-colors hover:bg-zaltyko-teal/5"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-zaltyko-indigo/10 text-xs font-semibold text-zaltyko-indigo dark:bg-zaltyko-electric/15 dark:text-zaltyko-electric">
                {index + 1}
              </span>
              <div>
                <p className="text-sm font-medium text-foreground">{cls.name}</p>
                <p className="text-xs text-muted-foreground">
                  {cls.startTime && cls.endTime ? `${cls.startTime} – ${cls.endTime}` : "Horario pendiente"}
                </p>
              </div>
            </div>
            {cls.capacity ? <span className="text-xs text-muted-foreground">Cap. {cls.capacity}</span> : null}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
