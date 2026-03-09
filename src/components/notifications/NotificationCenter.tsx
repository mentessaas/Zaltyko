"use client";

import { useState, useEffect, useCallback } from "react";
import { X, Check, CheckCheck, Trash2, Loader2, Bell, Calendar, CreditCard, MessageSquare, Clock, AlertCircle, Mail } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { useRouter } from "next/navigation";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string | null;
  read: boolean;
  createdAt: string;
  data: Record<string, unknown> | null;
}

interface NotificationCenterProps {
  open: boolean;
  onClose: () => void;
  onNotificationRead?: () => void;
}

const NOTIFICATION_TYPE_LABELS: Record<string, string> = {
  all: "Todas",
  class_reminder: "Recordatorio",
  schedule_change: "Horario",
  attendance: "Asistencia",
  invoice_pending: "Factura",
  invoice_paid: "Pago",
  event: "Evento",
  message: "Mensaje",
  renewal: "Renovación",
  contact_message: "Contacto",
};

const getNotificationIcon = (type: string) => {
  if (type.includes("invoice") || type.includes("payment")) return CreditCard;
  if (type.includes("class") || type.includes("schedule") || type.includes("reminder")) return Calendar;
  if (type.includes("message") || type.includes("contact")) return MessageSquare;
  if (type.includes("event")) return Calendar;
  if (type.includes("attendance")) return Check;
  return Bell;
};

const getNotificationColor = (type: string) => {
  if (type.includes("invoice_pending")) return "bg-amber-100 text-amber-600";
  if (type.includes("invoice_paid")) return "bg-green-100 text-green-600";
  if (type.includes("class") || type.includes("schedule") || type.includes("reminder")) return "bg-blue-100 text-blue-600";
  if (type.includes("message") || type.includes("contact")) return "bg-purple-100 text-purple-600";
  if (type.includes("attendance")) return "bg-yellow-100 text-yellow-600";
  if (type.includes("event")) return "bg-pink-100 text-pink-600";
  return "bg-gray-100 text-gray-600";
};

export function NotificationCenter({
  open,
  onClose,
  onNotificationRead,
}: NotificationCenterProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const router = useRouter();

  const loadNotifications = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        limit: "10",
        ...(filter === "unread" && { unreadOnly: "true" }),
        ...(typeFilter !== "all" && { type: typeFilter }),
      });

      const response = await fetch(`/api/notifications?${params}`);
      const data = await response.json();

      if (data.items) {
        setNotifications(data.items);
      }
    } catch (error) {
      console.error("Error loading notifications:", error);
    } finally {
      setIsLoading(false);
    }
  }, [filter, typeFilter]);

  useEffect(() => {
    if (open) {
      loadNotifications();
    }
  }, [open, filter, typeFilter, loadNotifications]);

  const handleMarkAsRead = async (notificationId: string) => {
    try {
      await fetch(`/api/notifications/${notificationId}/read`, {
        method: "PUT",
      });
      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n))
      );
      onNotificationRead?.();
    } catch (error) {
      console.error("Error marking notification as read:", error);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await fetch("/api/notifications/read-all", {
        method: "PUT",
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      onNotificationRead?.();
    } catch (error) {
      console.error("Error marking all as read:", error);
    }
  };

  const handleDelete = async (notificationId: string) => {
    try {
      await fetch(`/api/notifications/${notificationId}`, {
        method: "DELETE",
      });
      setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
      onNotificationRead?.();
    } catch (error) {
      console.error("Error deleting notification:", error);
    }
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Notificaciones
            </span>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </DialogTitle>
          <DialogDescription>
            {/* Type Filter */}
            <div className="mt-2">
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="h-8">
                  <SelectValue placeholder="Filtrar por tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los tipos</SelectItem>
                  <SelectItem value="class_reminder">Recordatorios</SelectItem>
                  <SelectItem value="schedule_change">Cambios de horario</SelectItem>
                  <SelectItem value="attendance">Asistencia</SelectItem>
                  <SelectItem value="invoice_pending">Facturas pendientes</SelectItem>
                  <SelectItem value="invoice_paid">Facturas pagadas</SelectItem>
                  <SelectItem value="event">Eventos</SelectItem>
                  <SelectItem value="message">Mensajes</SelectItem>
                  <SelectItem value="contact_message">Mensajes de contacto</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Read Filter */}
            <div className="flex gap-2 mt-2">
              <Button
                variant={filter === "all" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilter("all")}
                className="flex-1"
              >
                Todas
              </Button>
              <Button
                variant={filter === "unread" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilter("unread")}
                className="flex-1"
              >
                No leídas ({unreadCount})
              </Button>
            </div>

            {/* Mark all as read */}
            {unreadCount > 0 && filter === "all" && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleMarkAllAsRead}
                className="w-full mt-2 text-muted-foreground"
              >
                <CheckCheck className="mr-1 h-3 w-3" />
                Marcar todas como leídas
              </Button>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-2 mt-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No hay notificaciones</p>
            </div>
          ) : (
            notifications.map((notification) => {
              const IconComponent = getNotificationIcon(notification.type);
              const colorClass = getNotificationColor(notification.type);
              const isContactMessage = notification.type === "contact_message";
              const academyId = notification.data?.academyId as string | undefined;

              const handleClick = () => {
                if (isContactMessage && academyId) {
                  router.push(`/app/${academyId}/messages`);
                  onClose();
                }
              };

              return (
                <Card
                  key={notification.id}
                  className={`${notification.read ? "opacity-60" : ""} ${isContactMessage ? "cursor-pointer hover:bg-muted/50 transition-colors" : ""}`}
                  onClick={isContactMessage ? handleClick : undefined}
                >
                  <CardContent className="p-3">
                    <div className="flex items-start gap-3">
                      {/* Icon */}
                      <div className={`p-2 rounded-full shrink-0 ${colorClass}`}>
                        <IconComponent className="h-4 w-4" />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-medium text-sm truncate">{notification.title}</p>
                          {!notification.read && (
                            <Badge variant="default" className="h-2 w-2 p-0 rounded-full shrink-0" />
                          )}
                        </div>
                        {notification.message && (
                          <p className="text-xs text-muted-foreground mb-1 line-clamp-2">
                            {notification.message}
                          </p>
                        )}
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px]">
                            {NOTIFICATION_TYPE_LABELS[notification.type] || notification.type}
                          </Badge>
                          <p className="text-[10px] text-muted-foreground">
                            {formatDistanceToNow(new Date(notification.createdAt), {
                              addSuffix: true,
                              locale: es,
                            })}
                          </p>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                        {!notification.read && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => handleMarkAsRead(notification.id)}
                            title="Marcar como leída"
                          >
                            <Check className="h-3 w-3" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          onClick={() => handleDelete(notification.id)}
                          title="Eliminar"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>

        {/* Footer with link to full page */}
        <div className="border-t pt-3 mt-2">
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => {
              onClose();
              // Navigate to notifications page if academy context is available
            }}
          >
            Ver todas las notificaciones
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
