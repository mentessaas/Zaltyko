"use client";

import { useState, useEffect, useCallback } from "react";
import { Bell, BellOff, Check, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { logger } from "@/lib/logger";
import { useToast } from "@/components/ui/toast-provider";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type PermissionStatus = "default" | "granted" | "denied";

interface PushNotificationPermissionProps {
  onPermissionChange?: (granted: boolean) => void;
  className?: string;
}

export function PushNotificationPermission({
  onPermissionChange,
  className,
}: PushNotificationPermissionProps) {
  const toast = useToast();
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus>("default");
  const [isLoading, setIsLoading] = useState(false);
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);

  // Check current permission status on mount
  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      return;
    }

    setPermissionStatus(Notification.permission as PermissionStatus);

    // Check if already subscribed
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.ready.then((registration) => {
        registration.pushManager.getSubscription().then((sub) => {
          setSubscription(sub);
        });
      });
    }
  }, []);

  const requestPermission = useCallback(async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      toast.pushToast({ title: "Notificaciones no soportadas", description: "Tu navegador no soporta notificaciones push", variant: "error" });
      return;
    }

    if (!("serviceWorker" in navigator)) {
      toast.pushToast({ title: "Service Worker no disponible", description: "Tu navegador no soporta Service Workers", variant: "error" });
      return;
    }

    setIsLoading(true);

    try {
      const permission = await Notification.requestPermission();

      setPermissionStatus(permission as PermissionStatus);

      if (permission === "granted") {
        const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
        if (!vapidPublicKey) {
          throw new Error("PUSH_NOT_CONFIGURED");
        }
        // Subscribe to push notifications
        const registration = await navigator.serviceWorker.ready;
        const pushSubscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as any,
        });

        // Send subscription to server
        const subscribeResponse = await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(pushSubscription),
        });
        if (!subscribeResponse.ok) {
          throw new Error("PUSH_SUBSCRIBE_FAILED");
        }

        setSubscription(pushSubscription as PushSubscription);
        onPermissionChange?.(true);

        toast.pushToast({ title: "Notificaciones activadas", description: "Recibirás notificaciones de Zaltyko", variant: "success" });
      } else {
        onPermissionChange?.(false);
        toast.pushToast({ title: "Notificaciones bloqueadas", description: "Bloquea las notificaciones en la configuración del navegador", variant: "error" });
      }
    } catch (error) {
      logger.error("Error requesting notification permission:", error);
      toast.pushToast({ title: "No se pudieron activar las notificaciones", description: error instanceof Error && error.message === "PUSH_NOT_CONFIGURED" ? "El servicio aún no está configurado para esta academia." : "Inténtalo de nuevo en unos segundos.", variant: "error" });
    } finally {
      setIsLoading(false);
    }
  }, [onPermissionChange, toast]);

  const unsubscribe = useCallback(async () => {
    if (!subscription) return;

    setIsLoading(true);

    try {
      await subscription.unsubscribe();

      // Notify server
      const unsubscribeResponse = await fetch("/api/push/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });
      if (!unsubscribeResponse.ok) {
        throw new Error("PUSH_UNSUBSCRIBE_FAILED");
      }

      setSubscription(null);
      setPermissionStatus("default");
      onPermissionChange?.(false);

      toast.pushToast({ title: "Notificaciones desactivadas", description: "Ya no recibirás notificaciones push", variant: "success" });
    } catch (error) {
      logger.error("Error unsubscribing:", error);
      toast.pushToast({ title: "No se pudieron desactivar las notificaciones", description: "Inténtalo de nuevo en unos segundos.", variant: "error" });
    } finally {
      setIsLoading(false);
    }
  }, [subscription, onPermissionChange, toast]);

  // Check if notifications are supported
  const isSupported =
    typeof window !== "undefined" && "Notification" in window;

  if (!isSupported) {
    return null;
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          {permissionStatus === "granted" ? (
            <Bell className="w-5 h-5 text-green-500" />
          ) : (
            <BellOff className="w-5 h-5 text-gray-400" />
          )}
          Notificaciones Push
        </CardTitle>
        <CardDescription>
          Recibe alertas en tiempo real sobre tu academia
        </CardDescription>
      </CardHeader>
      <CardContent>
        {permissionStatus === "default" && (
          <Button
            onClick={requestPermission}
            disabled={isLoading}
            className="w-full"
            size="lg"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Bell className="w-4 h-4 mr-2" />
            )}
            Activar notificaciones
          </Button>
        )}

        {permissionStatus === "granted" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
              <Check className="w-5 h-5" />
              <span className="text-sm font-medium">Notificaciones activas</span>
            </div>
            <Button
              onClick={unsubscribe}
              disabled={isLoading}
              variant="outline"
              className="w-full"
              size="sm"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <BellOff className="w-4 h-4 mr-2" />
              )}
              Desactivar notificaciones
            </Button>
          </div>
        )}

        {permissionStatus === "denied" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-red-500">
              <X className="w-5 h-5" />
              <span className="text-sm font-medium">Notificaciones bloqueadas</span>
            </div>
            <p className="text-xs text-gray-500">
              Para activar las notificaciones, cambia la configuración en tu
              navegador.
            </p>
            <Button
              onClick={requestPermission}
              variant="outline"
              className="w-full"
              size="sm"
            >
              Solicitar permiso de nuevo
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Helper function to convert VAPID key
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  if (!base64String) {
    // Return a dummy key if not configured - will need real key in production
    return new Uint8Array([]);
  }

  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}

// Hook for managing push notifications
export function usePushNotifications() {
  const [isSupported, setIsSupported] = useState(false);
  const [permission, setPermission] = useState<PermissionStatus>("default");
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    setIsSupported("Notification" in window && "serviceWorker" in navigator);

    if ("Notification" in window) {
      setPermission(Notification.permission as PermissionStatus);

      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.ready.then((registration) => {
          registration.pushManager.getSubscription().then((sub) => {
            setSubscription(sub);
          });
        });
      }
    }
  }, []);

  const requestPermission = useCallback(async () => {
    if (!isSupported) return null;

    const result = await Notification.requestPermission();
    setPermission(result as PermissionStatus);
    return result === "granted";
  }, [isSupported]);

  const subscribe = useCallback(async () => {
    if (!isSupported) return null;

    const registration = await navigator.serviceWorker.ready;
    const sub = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(
        process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ""
      ) as any,
    });

    setSubscription(sub);
    return sub;
  }, [isSupported]);

  const unsubscribe = useCallback(async () => {
    if (!subscription) return;

    await subscription.unsubscribe();
    setSubscription(null);
  }, [subscription]);

  return {
    isSupported,
    permission,
    subscription,
    requestPermission,
    subscribe,
    unsubscribe,
  };
}
