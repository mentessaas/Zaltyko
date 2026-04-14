"use client";

import { useState, useEffect, useCallback } from "react";

export interface ServiceWorkerState {
  registration: ServiceWorkerRegistration | null;
  waitingWorker: ServiceWorker | null;
  update: () => Promise<void>;
  activate: () => Promise<void>;
  isUpdateAvailable: boolean;
}

export function useServiceWorker(): ServiceWorkerState {
  const [registration, setRegistration] =
    useState<ServiceWorkerRegistration | null>(null);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(
    null
  );

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    const registerSW = async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
        });

        setRegistration(reg);

        // Check for waiting worker
        if (reg.waiting) {
          setWaitingWorker(reg.waiting);
        }

        // Listen for updates
        reg.addEventListener("updatefound", () => {
          const newWorker = reg.installing;
          if (!newWorker) return;

          newWorker.addEventListener("statechange", () => {
            if (newWorker.state === "installed") {
              if (navigator.serviceWorker.controller) {
                // New version available
                setWaitingWorker(newWorker);
              } else {
                // First install, activate immediately
                newWorker.postMessage({ type: "SKIP_WAITING" });
              }
            }
          });
        });

        // Handle controller change (after activation)
        navigator.serviceWorker.addEventListener("controllerchange", () => {
          // Reload to get new version
          window.location.reload();
        });
      } catch (error) {
        console.error("Service worker registration failed:", error);
      }
    };

    registerSW();
  }, []);

  const update = useCallback(async () => {
    if (!registration) return;

    try {
      await registration.update();
    } catch (error) {
      console.error("SW update failed:", error);
    }
  }, [registration]);

  const activate = useCallback(async () => {
    if (!waitingWorker) return;

    try {
      waitingWorker.postMessage({ type: "SKIP_WAITING" });

      // Wait for activation
      await new Promise<void>((resolve) => {
        waitingWorker.addEventListener("statechange", function listener() {
          if (waitingWorker.state === "activated") {
            waitingWorker.removeEventListener("statechange", listener);
            resolve();
          }
        });
      });

      // Reload to get new version
      window.location.reload();
    } catch (error) {
      console.error("SW activation failed:", error);
    }
  }, [waitingWorker]);

  return {
    registration,
    waitingWorker,
    update,
    activate,
    isUpdateAvailable: waitingWorker !== null,
  };
}
