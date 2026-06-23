"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Megaphone } from "lucide-react";

interface Announcement {
  id: string;
  title: string;
  content: string;
  priority: string;
  published_at: string | null;
}

/**
 * Panel de anuncios de la academia.
 * Carga inicial lazy desde /api/academies/[id]/announcements.
 */
export function AnnouncementsPanel({ academyId }: { academyId: string }) {
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/academies/${academyId}/announcements`)
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled && json.success) {
          setItems(json.data ?? []);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [academyId]);

  if (loading) {
    return (
      <div className="space-y-3 animate-pulse" aria-busy="true">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="h-24 bg-muted rounded-xl" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <Megaphone className="mx-auto h-12 w-12 text-muted-foreground mb-3" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">
            No hay anuncios publicados en tu academia.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((a) => (
        <Card key={a.id}>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Megaphone
                className={`h-5 w-5 mt-0.5 shrink-0 ${
                  a.priority === "high" ? "text-red-600" : "text-zaltyko-accent"
                }`}
                aria-hidden="true"
              />
              <div className="flex-1">
                <p className="font-medium text-sm">{a.title}</p>
                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{a.content}</p>
                {a.published_at && (
                  <p className="text-xs text-muted-foreground mt-2">
                    {new Date(a.published_at).toLocaleString()}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
      <Link
        href={`/app/${academyId}/announcements`}
        className="block text-center text-sm font-medium text-zaltyko-accent hover:underline pt-2 min-h-[44px]"
      >
        Ver todos los anuncios
      </Link>
    </div>
  );
}