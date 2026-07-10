"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Bell } from "lucide-react";

interface Notification {
  id: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

/**
 * Panel de notificaciones in-app.
 * Carga inicial lazy desde /api/notifications.
 */
export function NotificationsPanel({ academyId }: { academyId: string }) {
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/notifications?limit=20&offset=0")
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled && json.ok) {
          setItems(json.data?.items ?? []);
          setError(null);
        } else if (!cancelled) {
          setError(json.message ?? "No se pudieron cargar las notificaciones.");
        }
      })
      .catch(() => {
        if (!cancelled) setError("No se pudieron cargar las notificaciones.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="space-y-3 animate-pulse" aria-busy="true">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-16 bg-muted rounded-xl" />
        ))}
      </div>
    );
  }

  if (error) {
    return <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</p>;
  }

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <Bell className="mx-auto h-12 w-12 text-muted-foreground mb-3" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">
            No tienes notificaciones nuevas.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((n) => (
        <Card key={n.id} className={!n.read ? "border-zaltyko-accent/30" : undefined}>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Bell
                className={`h-5 w-5 mt-0.5 shrink-0 ${n.read ? "text-muted-foreground" : "text-zaltyko-accent"}`}
                aria-hidden="true"
              />
              <div className="flex-1">
                <p className="font-medium text-sm">{n.title}</p>
                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{n.message}</p>
                <p className="text-xs text-muted-foreground mt-2">
                  {new Date(n.createdAt).toLocaleString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
      <Link
        href={`/app/${academyId}/notifications`}
        className="block text-center text-sm font-medium text-zaltyko-accent hover:underline pt-2 min-h-[44px]"
      >
        Ver todas las notificaciones
      </Link>
    </div>
  );
}
