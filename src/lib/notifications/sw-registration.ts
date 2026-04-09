/**
 * Service Worker Registration Helper
 *
 * Handles SW registration with proper update cycles.
 */

export interface SWRegistrationResult {
  success: boolean;
  registration?: ServiceWorkerRegistration;
  error?: string;
  version?: string;
}

let swRegistration: ServiceWorkerRegistration | null = null;

/**
 * Register the service worker
 */
export async function registerServiceWorker(): Promise<SWRegistrationResult> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return { success: false, error: "Service workers not supported" };
  }

  try {
    // Unregister existing SW first to ensure clean registration
    const existingRegs = await navigator.serviceWorker.getRegistrations();
    for (const reg of existingRegs) {
      if (reg.active?.scriptURL.includes("sw.js")) {
        await reg.unregister();
      }
    }

    const registration = await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
      type: "classic",
    });

    swRegistration = registration;

    // Handle updates
    registration.addEventListener("updatefound", () => {
      const newWorker = registration.installing;
      if (!newWorker) return;

      newWorker.addEventListener("statechange", () => {
        if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
          // New version available
          console.log("New service worker version available");
          dispatchMessage({ type: "SKIP_WAITING" });
        }
      });
    });

    // Wait for activation
    await navigator.serviceWorker.ready;

    return {
      success: true,
      registration,
    };
  } catch (error) {
    console.error("Service worker registration failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Send message to service worker
 */
export function dispatchMessage(data: { type: string; [key: string]: unknown }): void {
  if (!navigator.serviceWorker.controller) return;

  navigator.serviceWorker.controller.postMessage(data);
}

/**
 * Get current service worker version
 */
export async function getSWVersion(): Promise<string | null> {
  if (!navigator.serviceWorker.controller) return null;

  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = (event) => {
      resolve(event.data?.version || null);
    };
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage(
        { type: "GET_VERSION" },
        [channel.port2]
      );
    }

    // Timeout after 1 second
    setTimeout(() => resolve(null), 1000);
  });
}

/**
 * Clear all caches via SW
 */
export async function clearSWCache(): Promise<boolean> {
  if (!navigator.serviceWorker.controller) return false;

  dispatchMessage({ type: "CLEAR_CACHE" });
  return true;
}

/**
 * Request background sync for pending operations
 */
export async function requestBackgroundSync(tag: string = "sync-pending-operations"): Promise<boolean> {
  if (!swRegistration) {
    const result = await registerServiceWorker();
    if (!result.success) return false;
  }

  try {
    if ("sync" in swRegistration!) {
      await (swRegistration as any).sync.register(tag);
      return true;
    }
    return false;
  } catch (error) {
    console.error("Background sync registration failed:", error);
    return false;
  }
}

/**
 * Check if push is supported
 */
export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/**
 * Get current push subscription
 */
export async function getCurrentPushSubscription(): Promise<PushSubscriptionJSON | null> {
  if (!isPushSupported()) return null;

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    return subscription?.toJSON() || null;
  } catch (error) {
    console.error("Error getting push subscription:", error);
    return null;
  }
}

/**
 * Check if there's an update available for the SW
 */
export async function checkForSWUpdate(): Promise<boolean> {
  if (!swRegistration) {
    const result = await registerServiceWorker();
    if (!result.success) return false;
  }

  if (!swRegistration?.installing) return false;

  return new Promise((resolve) => {
    swRegistration!.installing!.addEventListener("statechange", (event) => {
      const target = event.target as ServiceWorker;
      if (target.state === "installed" && navigator.serviceWorker.controller) {
        resolve(true);
      } else if (target.state === "activated") {
        resolve(false);
      }
    });

    // Timeout after 30 seconds
    setTimeout(() => resolve(false), 30000);
  });
}
