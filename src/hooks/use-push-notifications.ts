"use client";

import { useState, useEffect, useCallback } from "react";

type PermissionStatus = "default" | "granted" | "denied";

interface UsePushNotificationsOptions {
  onNotification?: (notification: PushNotification) => void;
  onSubscriptionChange?: (subscription: PushSubscriptionJSON | null) => void;
}

interface PushNotification {
  title: string;
  body: string;
  icon?: string;
  tag?: string;
  data?: Record<string, unknown>;
}

export function usePushNotifications(options: UsePushNotificationsOptions = {}) {
  const { onNotification, onSubscriptionChange } = options;

  const [isSupported, setIsSupported] = useState(false);
  const [permission, setPermission] = useState<PermissionStatus>("default");
  const [subscription, setSubscription] = useState<PushSubscriptionJSON | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check support on mount
  useEffect(() => {
    if (typeof window === "undefined") return;

    const supported =
      "Notification" in window &&
      "serviceWorker" in navigator &&
      "PushManager" in window;

    setIsSupported(supported);

    if (supported) {
      setPermission(Notification.permission as PermissionStatus);
    }
  }, []);

  // Get current subscription
  useEffect(() => {
    if (!isSupported) return;

    const getSubscription = async () => {
      try {
        const registration = await navigator.serviceWorker.ready;
        const sub = await registration.pushManager.getSubscription();
        setSubscription(sub?.toJSON() || null);
        onSubscriptionChange?.(sub?.toJSON() || null);
      } catch (err) {
        console.error("Error getting push subscription:", err);
      }
    };

    getSubscription();
  }, [isSupported, onSubscriptionChange]);

  // Listen for push notifications
  useEffect(() => {
    if (!isSupported || typeof window === "undefined") return;

    const handlePush = (event: PushEvent) => {
      if (!event.data) return;

      try {
        const data = event.data.json() as PushNotification;
        onNotification?.(data);

        // Show browser notification if permission granted
        if (permission === "granted") {
          new window.Notification(data.title, {
            body: data.body,
            icon: data.icon || "/icons/icon-192x192.png",
            tag: data.tag,
          });
        }
      } catch (err) {
        console.error("Error handling push notification:", err);
      }
    };

    const registration = navigator.serviceWorker.ready.then((reg) => {
      reg.addEventListener("push", handlePush);
      return reg;
    });

    return () => {
      registration.then((reg) => {
        reg.removeEventListener("push", handlePush);
      });
    };
  }, [isSupported, permission, onNotification]);

  // Get VAPID public key from server
  const getVapidKey = useCallback(async (): Promise<string | null> => {
    try {
      const response = await fetch("/api/push/vapid");
      const data = await response.json();
      return data.publicKey || null;
    } catch (err) {
      console.error("Error fetching VAPID key:", err);
      return null;
    }
  }, []);

  // Request browser permission
  const requestBrowserPermission = useCallback(async (): Promise<PermissionStatus> => {
    if (!isSupported) {
      setError("Push notifications not supported");
      return "default";
    }

    try {
      const result = await Notification.requestPermission();
      const status = result as PermissionStatus;
      setPermission(status);
      return status;
    } catch (err) {
      console.error("Error requesting permission:", err);
      setError("Failed to request permission");
      return "default";
    }
  }, [isSupported]);

  // Subscribe to push notifications
  const subscribe = useCallback(async (): Promise<PushSubscriptionJSON | null> => {
    if (!isSupported) {
      setError("Push notifications not supported");
      return null;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Get VAPID public key
      const vapidPublicKey = await getVapidKey();

      if (!vapidPublicKey) {
        setError("VAPID key not configured");
        return null;
      }

      // Request browser permission if needed
      if (permission !== "granted") {
        const status = await requestBrowserPermission();
        if (status !== "granted") {
          setError("Browser permission denied");
          return null;
        }
      }

      // Subscribe
      const registration = await navigator.serviceWorker.ready;
      const pushSubscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });

      const subscriptionJson = pushSubscription.toJSON();
      setSubscription(subscriptionJson);
      onSubscriptionChange?.(subscriptionJson);

      // Send to server
      const response = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: subscriptionJson.endpoint,
          keys: subscriptionJson.keys,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        setError(data.error || "Failed to subscribe");
        return null;
      }

      return subscriptionJson;
    } catch (err) {
      console.error("Error subscribing:", err);
      setError("Failed to subscribe to push notifications");
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [isSupported, permission, getVapidKey, requestBrowserPermission, onSubscriptionChange]);

  // Unsubscribe from push notifications
  const unsubscribe = useCallback(async (): Promise<boolean> => {
    if (!isSupported || !subscription) {
      return false;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Unsubscribe from browser
      const registration = await navigator.serviceWorker.ready;
      const pushSubscription = await registration.pushManager.getSubscription();

      if (pushSubscription) {
        await pushSubscription.unsubscribe();
      }

      // Notify server
      await fetch("/api/push/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: subscription.endpoint,
        }),
      });

      setSubscription(null);
      onSubscriptionChange?.(null);
      return true;
    } catch (err) {
      console.error("Error unsubscribing:", err);
      setError("Failed to unsubscribe");
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [isSupported, subscription, onSubscriptionChange]);

  // Send a test notification (for debugging)
  const sendTestNotification = useCallback(async (userId: string): Promise<boolean> => {
    try {
      const response = await fetch("/api/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          title: "Test Notification",
          body: "Push notifications are working!",
          alsoCreateInApp: true,
        }),
      });

      return response.ok;
    } catch (err) {
      console.error("Error sending test notification:", err);
      return false;
    }
  }, []);

  return {
    isSupported,
    permission,
    subscription,
    isLoading,
    error,
    requestPermission: requestBrowserPermission,
    subscribe,
    unsubscribe,
    sendTestNotification,
  };
}

// Helper function to convert VAPID key
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  if (!base64String) {
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
