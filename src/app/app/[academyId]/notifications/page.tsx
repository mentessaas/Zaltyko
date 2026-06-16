"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Bell,
  Check,
  CheckCheck,
  Trash2,
  Loader2,
  Calendar,
  CreditCard,
  FileText,
  MessageSquare,
  RefreshCw,
  Settings,
  Filter,
  Clock,
  AlertCircle,
  Mail,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { NotificationPreferences } from "@/components/notifications/NotificationPreferences";
import { PushNotificationPermission } from "@/components/notifications/PushNotificationPermission";
import { useAcademyContext } from "@/hooks/use-academy-context";

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string | null;
  read: boolean;
  createdAt: string;
  data: Record<string, unknown> | null;
}

const NOTIFICATION_TYPES = [
  { value: "all", label: "Todas", icon: Bell },
  { value: "class_reminder", label: "Recordatorio de clase", icon: Calendar },
  { value: "schedule_change", label: "Cambio de horario", icon: Clock },
  { value: "attendance", label: "Asistencia", icon: Check },
  { value: "invoice_pending", label: "Factura pendiente", icon: CreditCard },
  { value: "invoice_paid", label: "Factura pagada", icon: CreditCard },
  { value: "event", label: "Evento", icon: Calendar },
  { value: "message", label: "Mensaje", icon: MessageSquare },
  { value: "renewal", label: "Renovación", icon: RefreshCw },
  { value: "contact_message", label: "Mensaje de contacto", icon: Mail },
];

const getNotificationIcon = (type: string) => {
  const typeConfig = NOTIFICATION_TYPES.find((t) => t.value === type);
  return typeConfig?.icon || Bell;
};

const getNotificationColor = (type: string) => {
  if (type.includes("invoice") || type.includes("payment")) return "bg-blue-100 text-blue-600";
  if (type.includes("class") || type.includes("schedule")) return "bg-green-100 text-green-600";
  if (type.includes("message") || type.includes("contact")) return "bg-red-100 text-red-600";
  if (type.includes("attendance")) return "bg-yellow-100 text-yellow-600";
  if (type.includes("event")) return "bg-pink-100 text-pink-600";
  return "bg-gray-100 text-gray-600";
};

export default function NotificationsPage() {
  const params = useParams();
  const router = useRouter();
  const academyContext = useAcademyContext();
  const academyId = params.academyId as string;

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [filter, setFilter] = useState<string>("all");
  const [readFilter, setReadFilter] = useState<"all" | "unread">("all");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [activeTab, setActiveTab] = useState("list");

  const limit = 20;

  const loadNotifications = useCallback(
    async (reset = false) => {
      if (reset) {
        setIsLoading(true);
        setPage(1);
      } else {
        setIsLoadingMore(true);
      }

      try {
        const params = new URLSearchParams({
          limit: limit.toString(),
          offset: ((reset ? 1 : page) - 1 * limit).toString(),
          ...(filter !== "all" && { type: filter }),
          ...(readFilter === "unread" && { unreadOnly: "true" }),
        });

        const response = await fetch(`/api/notifications?${params}`);
        const data = await response.json();

        if (reset) {
          setNotifications(data.items || []);
        } else {
          setNotifications((prev) => [...prev, ...(data.items || [])]);
        }

        setHasMore((data.items || []).length === limit);
        if (!reset) setPage((prev) => prev + 1);
      } catch (error) {
        console.error("Error loading notifications:", error);
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [filter, readFilter, page]
  );

  useEffect(() => {
    loadNotifications(true);
  }, [filter, readFilter]);

  const handleMarkAsRead = async (notificationId: string) => {
    try {
      await fetch(`/api/notifications/${notificationId}/read`, {
        method: "PUT",
      });
      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n))
      );
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
    } catch (error) {
      console.error("Error deleting notification:", error);
    }
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  const renderNotificationItem = (notification: Notification) => {
    const IconComponent = getNotificationIcon(notification.type);
    const colorClass = getNotificationColor(notification.type);
    const isContactMessage = notification.type === "contact_message";
    const notificationAcademyId = notification.data?.academyId as string | undefined;

    const handleClick = () => {
      if (isContactMessage && notificationAcademyId) {
        router.push(`/app/${notificationAcademyId}/messages`);
      }
    };

    return (
      <Card
        key={notification.id}
        className={`${notification.read ? "opacity-60" : ""} ${
          isContactMessage ? "cursor-pointer hover:bg-muted/50 transition-colors" : ""
        }`}
        onClick={isContactMessage ? handleClick : undefined}
      >
        <CardContent className="p-4">
          <div className="flex items-start gap-4">
            {/* Icon */}
            <div className={`p-2 rounded-full ${colorClass}`}>
              <IconComponent className="h-5 w-5" />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <p className="font-medium text-sm truncate">{notification.title}</p>
                {!notification.read && (
                  <Badge variant="default" className="h-2 w-2 p-0 rounded-full" />
                )}
                <Badge variant="outline" className="text-xs ml-auto shrink-0">
                  {NOTIFICATION_TYPES.find((t) => t.value === notification.type)?.label ||
                    notification.type}
                </Badge>
              </div>
              {notification.message && (
                <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                  {notification.message}
                </p>
              )}
              {isContactMessage && notification.data && (
                <p className="text-xs text-muted-foreground mb-1">
                  De: {notification.data.contactName as string}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(notification.createdAt), {
                  addSuffix: true,
                  locale: es,
                })}
              </p>
            </div>

            {/* Actions */}
            <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
              {!notification.read && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => handleMarkAsRead(notification.id)}
                  title="Marcar como leída"
                >
                  <Check className="h-4 w-4" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive"
                onClick={() => handleDelete(notification.id)}
                title="Eliminar"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bell className="h-6 w-6" />
            Notificaciones
          </h1>
          <p className="text-muted-foreground">
            Gestiona tus notificaciones y preferencias
          </p>
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <Button variant="outline" onClick={handleMarkAllAsRead}>
              <CheckCheck className="mr-2 h-4 w-4" />
              Marcar todas como leídas
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="list" className="gap-2">
            <Bell className="h-4 w-4" />
            Lista ({notifications.length})
          </TabsTrigger>
          <TabsTrigger value="preferences" className="gap-2">
            <Settings className="h-4 w-4" />
            Preferencias
          </TabsTrigger>
        </TabsList>

        {/* List Tab */}
        <TabsContent value="list" className="mt-6 space-y-4">
          {/* Filters */}
          <Card>
            <CardHeader className="pb-4">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <label className="text-sm font-medium mb-2 block">Tipo de notificación</label>
                  <Select value={filter} onValueChange={setFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Filtrar por tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      {NOTIFICATION_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          <div className="flex items-center gap-2">
                            <type.icon className="h-4 w-4" />
                            {type.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-full sm:w-48">
                  <label className="text-sm font-medium mb-2 block">Estado</label>
                  <Select
                    value={readFilter}
                    onValueChange={(v) => setReadFilter(v as "all" | "unread")}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Estado" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas</SelectItem>
                      <SelectItem value="unread">No leídas</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
          </Card>

          {/* Notifications List */}
          <div className="space-y-2">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      <Skeleton className="h-10 w-10 rounded-full" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-3 w-1/2" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : notifications.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">No hay notificaciones</h3>
                  <p className="text-muted-foreground">
                    {filter !== "all" || readFilter !== "all"
                      ? "No hay notificaciones que coincidan con los filtros seleccionados"
                      : "No tienes notificaciones todavía"}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <>
                {notifications.map(renderNotificationItem)}
                {hasMore && (
                  <div className="flex justify-center pt-4">
                    <Button
                      variant="outline"
                      onClick={() => loadNotifications(false)}
                      disabled={isLoadingMore}
                    >
                      {isLoadingMore ? (
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
              </>
            )}
          </div>
        </TabsContent>

        {/* Preferences Tab */}
        <TabsContent value="preferences" className="mt-6 space-y-6">
          {/* Push Notifications */}
          <PushNotificationPermission />

          {/* In-App & Email Notifications */}
          <NotificationPreferences />
        </TabsContent>
      </Tabs>
    </div>
  );
}
