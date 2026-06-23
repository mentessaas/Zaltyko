"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { MessagesSquare } from "lucide-react";

interface Conversation {
  id: string;
  lastMessagePreview: string;
  lastMessageAt: string;
  unreadCount: number;
}

/**
 * Panel de mensajes directos (P2P conversaciones).
 * Carga inicial lazy desde /api/messages/conversations.
 */
export function MessagesPanel({ academyId }: { academyId: string }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/messages/conversations?academyId=${academyId}`)
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled && json.success) {
          setConversations(json.data ?? []);
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
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-20 bg-muted rounded-xl" />
        ))}
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <MessagesSquare className="mx-auto h-12 w-12 text-muted-foreground mb-3" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">
            No tienes mensajes. Inicia una conversacion desde un atleta o grupo.
          </p>
          <Link
            href={`/app/${academyId}/messages`}
            className="mt-3 inline-flex items-center text-sm font-medium text-zaltyko-accent hover:underline min-h-[44px]"
          >
            Ver mensajes completos
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {conversations.map((conv) => (
        <Link
          key={conv.id}
          href={`/app/${academyId}/messages?c=${conv.id}`}
          className="block rounded-xl border bg-card p-4 hover:border-zaltyko-accent/40 transition min-h-[44px]"
        >
          <p className="text-sm font-medium truncate">{conv.lastMessagePreview}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {new Date(conv.lastMessageAt).toLocaleString()}
            {conv.unreadCount > 0 && (
              <span className="ml-2 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-xs font-bold rounded-full bg-zaltyko-accent text-white">
                {conv.unreadCount}
              </span>
            )}
          </p>
        </Link>
      ))}
      <Link
        href={`/app/${academyId}/messages`}
        className="block text-center text-sm font-medium text-zaltyko-accent hover:underline pt-2 min-h-[44px]"
      >
        Ver todos los mensajes
      </Link>
    </div>
  );
}