"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { logger } from "@/lib/logger";
import {
  createControllerChangeHandler,
  listenForControllerChange,
} from "@/lib/service-worker-controller";

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
  const reloadOnControllerChangeRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    const serviceWorker = navigator.serviceWorker;
    let cancelled = false;
    let currentRegistration: ServiceWorkerRegistration | null = null;
    let handleUpdateFound: (() => void) | null = null;
    const observedWorkers = new Set<ServiceWorker>();
    const workerStateListeners: Array<{
      worker: ServiceWorker;
      listener: () => void;
    }> = [];
    const handleControllerChange = createControllerChangeHandler({
      initialHasController: Boolean(serviceWorker.controller),
      shouldReload: () => reloadOnControllerChangeRef.current,
      reload: () => {
        reloadOnControllerChangeRef.current = false;
        window.location.reload();
      },
    });
    const removeControllerChangeListener = listenForControllerChange(
      serviceWorker,
      handleControllerChange
    );

    const registerSW = async () => {
      try {
        const reg = await serviceWorker.register("/sw.js", {
          scope: "/",
        });
        if (cancelled) return;
        currentRegistration = reg;

        setRegistration(reg);

        // Listen for updates
        handleUpdateFound = () => {
          const newWorker = reg.installing;
          if (!newWorker || observedWorkers.has(newWorker)) return;
          observedWorkers.add(newWorker);

          const handleStateChange = () => {
            if (newWorker.state === "installed") {
              newWorker.removeEventListener("statechange", handleStateChange);
              const listenerIndex = workerStateListeners.findIndex(
                (listener) => listener.worker === newWorker
              );
              if (listenerIndex >= 0) {
                workerStateListeners.splice(listenerIndex, 1);
              }
              if (cancelled) return;
              if (serviceWorker.controller) {
                // New version available
                setWaitingWorker(newWorker);
              } else {
                // First install can activate without interrupting this page.
                newWorker.postMessage({ type: "SKIP_WAITING" });
              }
            }
          };
          workerStateListeners.push({
            worker: newWorker,
            listener: handleStateChange,
          });
          newWorker.addEventListener("statechange", handleStateChange);
          if (newWorker.state === "installed") {
            handleStateChange();
          }
        };
        reg.addEventListener("updatefound", handleUpdateFound);
        // The registration can begin installing before register() resolves.
        handleUpdateFound();

        // The worker may already be waiting when this hook mounts.
        if (reg.waiting) {
          if (serviceWorker.controller) {
            setWaitingWorker(reg.waiting);
          } else {
            reg.waiting.postMessage({ type: "SKIP_WAITING" });
          }
        }
      } catch (error) {
        logger.error("Service worker registration failed:", error);
      }
    };

    registerSW();

    return () => {
      cancelled = true;
      removeControllerChangeListener();
      for (const { worker, listener } of workerStateListeners) {
        worker.removeEventListener("statechange", listener);
      }
      workerStateListeners.length = 0;
      if (currentRegistration && handleUpdateFound) {
        currentRegistration.removeEventListener(
          "updatefound",
          handleUpdateFound
        );
      }
    };
  }, []);

  const update = useCallback(async () => {
    if (!registration) return;

    try {
      await registration.update();
    } catch (error) {
      logger.error("SW update failed:", error);
    }
  }, [registration]);

  const activate = useCallback(async () => {
    if (!waitingWorker) return;

    try {
      reloadOnControllerChangeRef.current = true;

      // Wait for activation. The controllerchange listener performs the single
      // reload after this accepted update takes control.
      await new Promise<void>((resolve) => {
        const handleStateChange = () => {
          if (waitingWorker.state === "activated") {
            waitingWorker.removeEventListener("statechange", handleStateChange);
            resolve();
          }
        };
        waitingWorker.addEventListener("statechange", handleStateChange);
        if (waitingWorker.state === "activated") {
          waitingWorker.removeEventListener("statechange", handleStateChange);
          resolve();
        } else {
          waitingWorker.postMessage({ type: "SKIP_WAITING" });
        }
      });
    } catch (error) {
      reloadOnControllerChangeRef.current = false;
      logger.error("SW activation failed:", error);
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
