"use client";

import { useState, useEffect } from "react";
import { MessageSquare, Mail, Send, Clock, CheckCircle, XCircle, AlertCircle, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface MessageHistoryItem {
  id: string;
  templateId: string | null;
  groupId: string | null;
  channel: string;
  subject: string | null;
  body: string;
  recipients: {
    type: "individual" | "group" | "broadcast";
    ids: string[];
    count: number;
  } | null;
  status: string;
  sentAt: string | null;
  deliveredAt: string | null;
  failedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
}

interface CommunicationHistoryProps {
  academyId: string;
}

const CHANNEL_ICONS: Record<string, React.ElementType> = {
  whatsapp: MessageSquare,
  email: Mail,
  sms: Send,
  in_app: MessageSquare,
};

const STATUS_CONFIG: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  pending: { icon: Clock, color: "bg-yellow-100 text-yellow-600", label: "Pendiente" },
  sent: { icon: Send, color: "bg-blue-100 text-blue-600", label: "Enviado" },
  delivered: { icon: CheckCircle, color: "bg-green-100 text-green-600", label: "Entregado" },
  failed: { icon: XCircle, color: "bg-red-100 text-red-600", label: "Fallido" },
};

export function CommunicationHistory({ academyId }: CommunicationHistoryProps) {
  const [history, setHistory] = useState<MessageHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "whatsapp" | "email">("all");

  useEffect(() => {
    async function loadHistory() {
      setIsLoading(true);
      try {
        const params = new URLSearchParams();
        if (filter !== "all") {
          params.set("channel", filter);
        }
        params.set("limit", "20");

        const response = await fetch(`/api/communication/history?${params}`);
        if (response.ok) {
          const data = await response.json();
          setHistory(data.items || []);
        }
      } catch (error) {
        console.error("Error loading history:", error);
      } finally {
        setIsLoading(false);
      }
    }

    loadHistory();
  }, [academyId, filter]);

  const filteredHistory = filter === "all"
    ? history
    : history.filter((h) => h.channel === filter);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Historial de comunicaciones
        </CardTitle>
        <CardDescription>
          Ver los mensajes enviados anteriormente
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
          <TabsList>
            <TabsTrigger value="all">Todos</TabsTrigger>
            <TabsTrigger value="whatsapp">WhatsApp</TabsTrigger>
            <TabsTrigger value="email">Email</TabsTrigger>
          </TabsList>
        </Tabs>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredHistory.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No hay mensajes enviados</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredHistory.map((item) => {
              const IconComponent = CHANNEL_ICONS[item.channel] || MessageSquare;
              const statusConfig = STATUS_CONFIG[item.status] || STATUS_CONFIG.pending;

              return (
                <div
                  key={item.id}
                  className="flex items-start gap-3 p-3 border rounded-lg"
                >
                  <div className={`p-2 rounded-full ${statusConfig.color}`}>
                    <IconComponent className="h-4 w-4" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm capitalize">
                        {item.channel}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {statusConfig.label}
                      </Badge>
                    </div>

                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {item.body}
                    </p>

                    <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                      {item.recipients?.count && (
                        <span>
                          {item.recipients.count} destinatario{item.recipients.count > 1 ? "s" : ""}
                        </span>
                      )}
                      <span>
                        {formatDistanceToNow(new Date(item.createdAt), {
                          addSuffix: true,
                          locale: es,
                        })}
                      </span>
                    </div>
                  </div>

                  {item.status === "failed" && item.errorMessage && (
                    <div className="text-xs text-red-500 max-w-[150px] truncate">
                      {item.errorMessage}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
