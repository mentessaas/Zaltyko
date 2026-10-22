"use client";

import { useState } from "react";
import { History, CheckCircle, XCircle, Clock, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type MessageStatus = "pending" | "sent" | "delivered" | "read" | "failed";

export interface WhatsAppMessage {
  id: string;
  content: string;
  recipientCount: number;
  status: MessageStatus;
  sportConfigName?: string | null;
  createdAt: string;
  scheduledAt?: string;
  sentAt?: string;
  failureReason?: string;
  phone?: string;
}

interface WhatsAppHistoryProps {
  messages: WhatsAppMessage[];
  isLoading?: boolean;
  onLoadMore?: () => void;
  hasMore?: boolean;
  onRetry?: (message: WhatsAppMessage) => Promise<boolean>;
}

const STATUS_CONFIG: Record<MessageStatus, { label: string; icon: typeof CheckCircle; className: string }> = {
  pending: {
    label: "Pendiente",
    icon: Clock,
    className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-300",
  },
  sent: {
    label: "Enviado",
    icon: CheckCircle,
    className: "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300",
  },
  delivered: {
    label: "Entregado",
    icon: CheckCircle,
    className: "bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-300",
  },
  read: {
    label: "Leído",
    icon: CheckCircle,
    className: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300",
  },
  failed: {
    label: "Fallido",
    icon: XCircle,
    className: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300",
  },
};

export function WhatsAppHistory({ messages, isLoading, onLoadMore, hasMore, onRetry }: WhatsAppHistoryProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [retryErrorId, setRetryErrorId] = useState<string | null>(null);

  if (messages.length === 0 && !isLoading) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <History className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="font-semibold text-lg">No hay mensajes enviados</h3>
          <p className="text-muted-foreground text-sm mt-1">
            Envía tu primer mensaje de WhatsApp para ver el historial aquí.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="h-5 w-5" />
          Historial de mensajes
        </CardTitle>
        <CardDescription>
          Ver los mensajes enviados y su estado de entrega
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {messages.map((message) => {
          const status = STATUS_CONFIG[message.status];
          const StatusIcon = status.icon;
          const isExpanded = expandedId === message.id;

          return (
            <div
              key={message.id}
              className={cn(
                "border rounded-lg overflow-hidden transition-colors",
                isExpanded && "border-primary"
              )}
            >
              {/* Message Header */}
              <div
                className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50"
                onClick={() => setExpandedId(isExpanded ? null : message.id)}
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate pr-4">{message.content}</p>
                  <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                    <span>{message.recipientCount} destinatario(s)</span>
                    {message.sportConfigName && (
                      <>
                        <span>•</span>
                        <span>{message.sportConfigName}</span>
                      </>
                    )}
                    <span>•</span>
                    <span>
                      {new Date(message.scheduledAt || message.createdAt).toLocaleDateString("es-ES", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Badge className={cn("gap-1", status.className)}>
                    <StatusIcon className="h-3 w-3" />
                    {status.label}
                  </Badge>
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
              </div>

              {/* Expanded Details */}
              {isExpanded && (
                <div className="border-t p-4 bg-muted/30 space-y-3">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Creado</p>
                      <p className="font-medium">
                        {new Date(message.createdAt).toLocaleString("es-ES")}
                      </p>
                    </div>
                    {message.scheduledAt && (
                      <div>
                        <p className="text-muted-foreground">Programado para</p>
                        <p className="font-medium">
                          {new Date(message.scheduledAt).toLocaleString("es-ES")}
                        </p>
                      </div>
                    )}
                    {message.sentAt && (
                      <div>
                        <p className="text-muted-foreground">Enviado</p>
                        <p className="font-medium">
                          {new Date(message.sentAt).toLocaleString("es-ES")}
                        </p>
                      </div>
                    )}
                    <div>
                      <p className="text-muted-foreground">Destinatarios</p>
                      <p className="font-medium">{message.recipientCount}</p>
                    </div>
                  </div>

                  {message.failureReason && (
                    <div className="bg-red-50 border border-red-200 rounded p-3 dark:bg-red-950/30 dark:border-red-900/60">
                      <p className="text-sm text-red-800 dark:text-red-200 font-medium">Razón del fallo:</p>
                      <p className="text-sm text-red-700 dark:text-red-300">{message.failureReason}</p>
                    </div>
                  )}

                  {message.status === "failed" && onRetry && message.phone && (
                    <div className="space-y-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        disabled={retryingId === message.id}
                        onClick={async (event) => {
                          event.stopPropagation();
                          setRetryError(null);
                          setRetryErrorId(null);
                          setRetryingId(message.id);
                          try {
                            const retried = await onRetry(message);
                            if (!retried) {
                              setRetryError("No se pudo reintentar el envío.");
                              setRetryErrorId(message.id);
                            }
                          } catch {
                            setRetryError("No se pudo reintentar el envío.");
                            setRetryErrorId(message.id);
                          } finally {
                            setRetryingId(null);
                          }
                        }}
                      >
                        {retryingId === message.id ? "Reintentando…" : "Reintentar envío"}
                      </Button>
                      {retryError && retryErrorId === message.id && retryingId === null && (
                        <p className="text-xs text-red-700 dark:text-red-300" role="alert">{retryError}</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Load More */}
        {hasMore && (
          <div className="flex justify-center pt-4">
            <Button variant="outline" onClick={onLoadMore} disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Cargando...
                </>
              ) : (
                "Cargar más"
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export type { MessageStatus };
