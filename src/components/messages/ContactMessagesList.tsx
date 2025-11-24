"use client";

import { useState, useEffect } from "react";
import { Mail, Phone, Check, CheckCheck, Archive, ArchiveRestore, Trash2, Loader2, Reply } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast-provider";

interface ContactMessage {
  id: string;
  academyId: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string | null;
  message: string;
  read: boolean;
  readAt: string | null;
  responded: boolean;
  respondedAt: string | null;
  archived: boolean;
  createdAt: string | null;
}

interface ContactMessagesListProps {
  academyId: string;
  initialMessages: ContactMessage[];
}

export function ContactMessagesList({ academyId, initialMessages }: ContactMessagesListProps) {
  const [messages, setMessages] = useState<ContactMessage[]>(initialMessages);
  const [isLoading, setIsLoading] = useState(false);
  const [filter, setFilter] = useState<"all" | "unread" | "archived">("all");
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const { pushToast } = useToast();

  useEffect(() => {
    loadMessages();
  }, [filter]);

  const loadMessages = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        academyId,
        ...(filter === "unread" && { read: "false", archived: "false" }),
        ...(filter === "archived" && { archived: "true" }),
      });

      const response = await fetch(`/api/contact-messages?${params}`);
      const data = await response.json();

      if (data.items) {
        setMessages(data.items);
      }
    } catch (error) {
      console.error("Error loading messages:", error);
      pushToast({
        title: "Error",
        description: "No se pudieron cargar los mensajes.",
        variant: "error",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleMarkAsRead = async (messageId: string) => {
    if (processingIds.has(messageId)) return;
    setProcessingIds((prev) => new Set(prev).add(messageId));

    try {
      await fetch(`/api/contact-messages/${messageId}/read`, {
        method: "PUT",
      });
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, read: true, readAt: new Date().toISOString() } : m))
      );
      pushToast({
        title: "Mensaje marcado como leído",
        variant: "success",
      });
    } catch (error) {
      console.error("Error marking message as read:", error);
      pushToast({
        title: "Error",
        description: "No se pudo marcar el mensaje como leído.",
        variant: "error",
      });
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(messageId);
        return next;
      });
    }
  };

  const handleMarkAsResponded = async (messageId: string) => {
    if (processingIds.has(messageId)) return;
    setProcessingIds((prev) => new Set(prev).add(messageId));

    try {
      await fetch(`/api/contact-messages/${messageId}/respond`, {
        method: "PUT",
      });
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, responded: true, respondedAt: new Date().toISOString() } : m))
      );
      pushToast({
        title: "Mensaje marcado como respondido",
        variant: "success",
      });
    } catch (error) {
      console.error("Error marking message as responded:", error);
      pushToast({
        title: "Error",
        description: "No se pudo marcar el mensaje como respondido.",
        variant: "error",
      });
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(messageId);
        return next;
      });
    }
  };

  const handleArchive = async (messageId: string, currentlyArchived: boolean) => {
    if (processingIds.has(messageId)) return;
    setProcessingIds((prev) => new Set(prev).add(messageId));

    try {
      await fetch(`/api/contact-messages/${messageId}/archive`, {
        method: "PUT",
      });
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, archived: !currentlyArchived } : m))
      );
      pushToast({
        title: currentlyArchived ? "Mensaje desarchivado" : "Mensaje archivado",
        variant: "success",
      });
    } catch (error) {
      console.error("Error archiving message:", error);
      pushToast({
        title: "Error",
        description: "No se pudo archivar el mensaje.",
        variant: "error",
      });
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(messageId);
        return next;
      });
    }
  };

  const handleDelete = async (messageId: string) => {
    if (processingIds.has(messageId)) return;
    if (!confirm("¿Estás seguro de que quieres eliminar este mensaje?")) return;

    setProcessingIds((prev) => new Set(prev).add(messageId));

    try {
      await fetch(`/api/contact-messages/${messageId}`, {
        method: "DELETE",
      });
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
      pushToast({
        title: "Mensaje eliminado",
        variant: "success",
      });
    } catch (error) {
      console.error("Error deleting message:", error);
      pushToast({
        title: "Error",
        description: "No se pudo eliminar el mensaje.",
        variant: "error",
      });
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(messageId);
        return next;
      });
    }
  };

  const filteredMessages = messages.filter((m) => {
    if (filter === "unread") return !m.read && !m.archived;
    if (filter === "archived") return m.archived;
    return !m.archived;
  });

  const unreadCount = messages.filter((m) => !m.read && !m.archived).length;

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant={filter === "all" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("all")}
        >
          Todos
        </Button>
        <Button
          variant={filter === "unread" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("unread")}
        >
          No leídos {unreadCount > 0 && `(${unreadCount})`}
        </Button>
        <Button
          variant={filter === "archived" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("archived")}
        >
          Archivados
        </Button>
      </div>

      {/* Lista de mensajes */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredMessages.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            {filter === "archived"
              ? "No hay mensajes archivados"
              : filter === "unread"
              ? "No hay mensajes no leídos"
              : "No hay mensajes de contacto"}
          </div>
        ) : (
          filteredMessages.map((message) => {
            const isProcessing = processingIds.has(message.id);
            return (
              <Card
                key={message.id}
                className={`transition-all ${message.read ? "opacity-75" : ""} ${message.archived ? "border-dashed" : ""}`}
              >
                <CardContent className="p-4">
                  <div className="space-y-3">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-foreground">{message.contactName}</h3>
                          {!message.read && (
                            <Badge variant="default" className="h-2 w-2 p-0 rounded-full" />
                          )}
                          {message.responded && (
                            <Badge variant="success" className="text-xs">
                              Respondido
                            </Badge>
                          )}
                          {message.archived && (
                            <Badge variant="outline" className="text-xs">
                              Archivado
                            </Badge>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                          <a
                            href={`mailto:${message.contactEmail}`}
                            className="flex items-center gap-1 hover:text-foreground transition-colors"
                          >
                            <Mail className="h-3 w-3" />
                            {message.contactEmail}
                          </a>
                          {message.contactPhone && (
                            <a
                              href={`tel:${message.contactPhone}`}
                              className="flex items-center gap-1 hover:text-foreground transition-colors"
                            >
                              <Phone className="h-3 w-3" />
                              {message.contactPhone}
                            </a>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        {!message.read && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleMarkAsRead(message.id)}
                            disabled={isProcessing}
                            title="Marcar como leído"
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                        )}
                        {!message.responded && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleMarkAsResponded(message.id)}
                            disabled={isProcessing}
                            title="Marcar como respondido"
                          >
                            <Reply className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleArchive(message.id, message.archived)}
                          disabled={isProcessing}
                          title={message.archived ? "Desarchivar" : "Archivar"}
                        >
                          {message.archived ? (
                            <ArchiveRestore className="h-4 w-4" />
                          ) : (
                            <Archive className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => handleDelete(message.id)}
                          disabled={isProcessing}
                          title="Eliminar"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    {/* Mensaje */}
                    <div className="rounded-lg bg-muted/50 p-3">
                      <p className="text-sm text-foreground whitespace-pre-wrap">{message.message}</p>
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        {message.createdAt &&
                          format(new Date(message.createdAt), "PPP 'a las' p", {
                            locale: es,
                          })}
                      </span>
                      {message.readAt && (
                        <span>
                          Leído{" "}
                          {format(new Date(message.readAt), "PPP 'a las' p", {
                            locale: es,
                          })}
                        </span>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}

