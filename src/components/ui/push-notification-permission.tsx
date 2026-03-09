"use client";

import { useState, useEffect, useCallback } from "react";
import { Bell, BellOff, Check, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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

// Simple toast helper (replace with your actual toast implementation)
function showToast(title: string, description?: string, variant?: "default" | "destructive") {
  // For now, use console - replace with your toast implementation
  console.log(`[Toast:${variant || "default"}] ${title}: ${description}`);
}

export function PushNotificationPermission({
  onPermissionChange,
  className,
}: PushNotificationPermissionProps) {
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
      showToast(
        "Notificaciones no soportadas",
        "Tu navegador no soporta notificaciones push",
        "destructive"
      );
      return;
    }

    if (!("serviceWorker" in navigator)) {
      showToast(
        "Service Worker no disponible",
        "Tu navegador no soporta Service Workers",
        "destructive"
      );
      return;
    }

    setIsLoading(true);

    try {
      const permission = await Notification.requestPermission();

      setPermissionStatus(permission as PermissionStatus);

      if (permission === "granted") {
        // Subscribe to push notifications
        const registration = await navigator.serviceWorker.ready;
        const pushSubscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(
            process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ""
          ),
        });

        // Send subscription to server
        await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(pushSubscription),
        });

        setSubscription(pushSubscription as PushSubscription);
        onPermissionChange?.(true);

        showToast(
          "Notificaciones activadas",
          "Recibirás notificaciones de Zaltyko"
        );
      } else {
        onPermissionChange?.(false);
        showToast(
          "Notificaciones bloqueadas",
          "Bloquea las notificaciones en la configuración del navegador",
          "destructive"
        );
      }
    } catch (error) {
      console.error("Error requesting notification permission:", error);
      showToast(
        "Error",
        "No se pudieron activar las notificaciones",
        "destructive"
      );
    } finally {
      setIsLoading(false);
    }
  }, [onPermissionChange]);

  const unsubscribe = useCallback(async () => {
    if (!subscription) return;

    setIsLoading(true);

    try {
      await subscription.unsubscribe();

      // Notify server
      await fetch("/api/push/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });

      setSubscription(null);
      setPermissionStatus("default");
      onPermissionChange?.(false);

      showToast(
        "Notificaciones desactivadas",
        "Ya no recibirás notificaciones push"
      );
    } catch (error) {
      console.error("Error unsubscribing:", error);
      showToast(
        "Error",
        "No se pudieron desactivar las notificaciones",
        "destructive"
      );
    } finally {
      setIsLoading(false);
    }
  }, [subscription, onPermissionChange]);

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
              onClick={() => {
                Notification.requestPermission();
              }}
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
      ),
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
