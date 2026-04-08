"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { X, Check, CheckCheck, Trash2, Loader2, Bell, Calendar, CreditCard, MessageSquare, AlertCircle, Volume2, VolumeX, Sparkles, ChevronDown, Filter } from "lucide-react";
import { formatDistanceToNow, format, isToday, isYesterday, parseISO } from "date-fns";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

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
  attendance_low: "Asistencia baja",
  invoice_overdue: "Factura vencida",
  event_reminder: "Evento próximo",
  push_notification: "Push",
};

const PAGE_SIZE = 20;

const getNotificationIcon = (type: string) => {
  if (type.includes("invoice") || type.includes("payment")) return CreditCard;
  if (type.includes("class") || type.includes("schedule") || type.includes("reminder")) return Calendar;
  if (type.includes("message") || type.includes("contact")) return MessageSquare;
  if (type.includes("event")) return Calendar;
  if (type.includes("attendance")) return Check;
  return Bell;
};

const getNotificationColor = (type: string) => {
  if (type.includes("invoice_pending") || type.includes("invoice_overdue")) return "bg-amber-100 text-amber-600";
  if (type.includes("invoice_paid")) return "bg-green-100 text-green-600";
  if (type.includes("class") || type.includes("schedule") || type.includes("reminder")) return "bg-blue-100 text-blue-600";
  if (type.includes("message") || type.includes("contact")) return "bg-red-100 text-red-600";
  if (type.includes("attendance")) return "bg-yellow-100 text-yellow-600";
  if (type.includes("event")) return "bg-pink-100 text-pink-600";
  return "bg-gray-100 text-gray-600";
};

function formatNotificationDate(dateStr: string): string {
  const date = parseISO(dateStr);
  if (isToday(date)) {
    return `Hoy, ${format(date, "HH:mm")}`;
  }
  if (isYesterday(date)) {
    return `Ayer, ${format(date, "HH:mm")}`;
  }
  return format(date, "dd MMM, HH:mm", { locale: es });
}

export function NotificationCenter({
  open,
  onClose,
  onNotificationRead,
}: NotificationCenterProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<"all" | "today" | "week">("all");
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [showAISummary, setShowAISummary] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBatchAction, setIsBatchAction] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef(0);
  const router = useRouter();

  const loadNotifications = useCallback(async (reset = false) => {
    if (reset) {
      setIsLoading(true);
      setHasMore(true);
      cursorRef.current = 0;
    } else {
      setIsLoadingMore(true);
    }

    try {
      const offset = reset ? 0 : cursorRef.current;
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(offset),
        ...(filter === "unread" && { unreadOnly: "true" }),
        ...(typeFilter !== "all" && { type: typeFilter }),
      });

      const response = await fetch(`/api/notifications?${params}`);
      const data = await response.json();

      if (data.items) {
        if (reset) {
          setNotifications(data.items);
          cursorRef.current = data.items.length;
        } else {
          setNotifications((prev) => [...prev, ...data.items]);
          cursorRef.current += data.items.length;
        }
        setHasMore(data.items.length === PAGE_SIZE);
      }
    } catch (error) {
      console.error("Error loading notifications:", error);
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [filter, typeFilter]);

  // Intersection Observer for infinite scroll
  useEffect(() => {
    if (!open) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore && !isLoading) {
          loadNotifications(false);
        }
      },
      { threshold: 0.1 }
    );

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current);
    }

    return () => observer.disconnect();
  }, [open, hasMore, isLoadingMore, isLoading, loadNotifications]);

  useEffect(() => {
    if (open) {
      loadNotifications(true);
      setSelectedIds(new Set());
    }
  }, [open, filter, typeFilter, dateFilter, loadNotifications]);

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
      setSelectedIds(new Set());
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
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(notificationId);
        return next;
      });
      onNotificationRead?.();
    } catch (error) {
      console.error("Error deleting notification:", error);
    }
  };

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;

    setIsBatchAction(true);
    try {
      await Promise.all(
        Array.from(selectedIds).map((id) =>
          fetch(`/api/notifications/${id}`, { method: "DELETE" })
        )
      );
      setNotifications((prev) =>
        prev.filter((n) => !selectedIds.has(n.id))
      );
      setSelectedIds(new Set());
      onNotificationRead?.();
    } catch (error) {
      console.error("Error batch deleting:", error);
    } finally {
      setIsBatchAction(false);
    }
  };

  const handleBatchMarkRead = async () => {
    if (selectedIds.size === 0) return;

    setIsBatchAction(true);
    try {
      await Promise.all(
        Array.from(selectedIds).map((id) =>
          fetch(`/api/notifications/${id}/read`, { method: "PUT" })
        )
      );
      setNotifications((prev) =>
        prev.map((n) => (selectedIds.has(n.id) ? { ...n, read: true } : n))
      );
      setSelectedIds(new Set());
      onNotificationRead?.();
    } catch (error) {
      console.error("Error batch marking as read:", error);
    } finally {
      setIsBatchAction(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredNotifications.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredNotifications.map((n) => n.id)));
    }
  };

  const filteredNotifications = notifications.filter((n) => {
    if (dateFilter === "today") {
      return isToday(parseISO(n.createdAt));
    }
    if (dateFilter === "week") {
      const date = parseISO(n.createdAt);
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      return date >= weekAgo;
    }
    return true;
  });

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Notificaciones
              {unreadCount > 0 && (
                <Badge variant="destructive" className="h-5 text-xs">
                  {unreadCount}
                </Badge>
              )}
            </span>
            <div className="flex items-center gap-1">
              {selectedIds.size > 0 && (
                <span className="text-xs text-muted-foreground mr-2">
                  {selectedIds.size} sel.
                </span>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setSoundEnabled(!soundEnabled)}
                title={soundEnabled ? "Silenciar" : "Activar sonido"}
              >
                {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              </Button>
              <Button variant="ghost" size="icon" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </DialogTitle>
          <DialogDescription>
            {/* Filters Row */}
            <div className="flex gap-2 mt-2 flex-wrap">
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="h-8 w-[140px]">
                  <Filter className="h-3 w-3 mr-1" />
                  <SelectValue placeholder="Tipo" />
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
                </SelectContent>
              </Select>

              <Select value={dateFilter} onValueChange={setDateFilter}>
                <SelectTrigger className="h-8 w-[120px]">
                  <SelectValue placeholder="Fecha" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="today">Hoy</SelectItem>
                  <SelectItem value="week">Esta semana</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Read Filter Tabs */}
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
                No leídas
              </Button>
            </div>

            {/* Batch Actions */}
            {selectedIds.size > 0 && (
              <div className="flex gap-2 mt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleBatchMarkRead}
                  disabled={isBatchAction}
                  className="flex-1"
                >
                  <CheckCheck className="h-3 w-3 mr-1" />
                  Marcar leídas
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleBatchDelete}
                  disabled={isBatchAction}
                  className="flex-1 text-destructive"
                >
                  <Trash2 className="h-3 w-3 mr-1" />
                  Eliminar
                </Button>
              </div>
            )}

            {/* Mark all as read */}
            {unreadCount > 0 && filter === "all" && selectedIds.size === 0 && (
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

        {/* Notifications List */}
        <div className="flex-1 overflow-y-auto space-y-2 mt-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredNotifications.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No hay notificaciones</p>
            </div>
          ) : (
            <>
              {/* Select All */}
              <div className="flex items-center gap-2 px-1">
                <Checkbox
                  checked={selectedIds.size === filteredNotifications.length && filteredNotifications.length > 0}
                  onCheckedChange={toggleSelectAll}
                />
                <span className="text-xs text-muted-foreground">
                  {selectedIds.size === filteredNotifications.length ? "Deseleccionar todo" : "Seleccionar todo"}
                </span>
              </div>

              {filteredNotifications.map((notification) => {
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
                    className={cn(
                      notification.read ? "opacity-60" : "",
                      isContactMessage ? "cursor-pointer hover:bg-muted/50 transition-colors" : ""
                    )}
                    onClick={isContactMessage ? handleClick : undefined}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-start gap-3">
                        {/* Checkbox */}
                        <Checkbox
                          checked={selectedIds.has(notification.id)}
                          onCheckedChange={() => toggleSelect(notification.id)}
                          className="mt-1"
                          onClick={(e) => e.stopPropagation()}
                        />

                        {/* Icon */}
                        <div className={cn("p-2 rounded-full shrink-0", colorClass)}>
                          <IconComponent className="h-4 w-4" />
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className={cn("font-medium text-sm truncate", !notification.read && "font-semibold")}>
                              {notification.title}
                            </p>
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
                              {formatNotificationDate(notification.createdAt)}
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
              })}

              {/* Load More Trigger */}
              {hasMore && (
                <div ref={loadMoreRef} className="py-4 flex justify-center">
                  {isLoadingMore && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
                  {!isLoadingMore && hasMore && (
                    <Button variant="ghost" size="sm" onClick={() => loadNotifications(false)}>
                      <ChevronDown className="h-4 w-4 mr-1" />
                      Cargar más
                    </Button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
