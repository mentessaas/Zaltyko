"use client";

import { useState, useEffect, useCallback } from "react";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export interface InstallPromptState {
  installPrompt: BeforeInstallPromptEvent | null;
  isInstallable: boolean;
  isInstalled: boolean;
  promptInstall: () => Promise<void>;
  dismissPrompt: () => void;
  isDismissed: boolean;
}

export function useInstallPrompt(): InstallPromptState {
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    // Check if already installed
    const checkInstalled = () => {
      if (typeof window !== "undefined" && window.matchMedia) {
        const isStandalone = window.matchMedia(
          "(display-mode: standalone)"
        ).matches;
        setIsInstalled(isStandalone || (window.navigator as Navigator & { standalone?: boolean }).standalone === true);
      }
    };

    // Capture beforeinstallprompt event
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };

    // Handle app installed
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setInstallPrompt(null);
    };

    checkInstalled();

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    // Listen for display-mode changes
    const mediaQuery = window.matchMedia("(display-mode: standalone)");
    const handleDisplayModeChange = (e: MediaQueryListEvent) => {
      setIsInstalled(e.matches);
    };
    mediaQuery.addEventListener("change", handleDisplayModeChange);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
      mediaQuery.removeEventListener("change", handleDisplayModeChange);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!installPrompt) return;

    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;

    if (outcome === "accepted") {
      setInstallPrompt(null);
    } else {
      // User dismissed - store preference
      setIsDismissed(true);
      localStorage.setItem("pwa-install-dismissed", "true");
    }
  }, [installPrompt]);

  const dismissPrompt = useCallback(() => {
    setIsDismissed(true);
    localStorage.setItem("pwa-install-dismissed", "true");
  }, []);

  // Check if user previously dismissed
  useEffect(() => {
    if (typeof window !== "undefined") {
      const dismissed = localStorage.getItem("pwa-install-dismissed");
      if (dismissed === "true") {
        setIsDismissed(true);
      }
    }
  }, []);

  return {
    installPrompt,
    isInstallable: installPrompt !== null && !isInstalled && !isDismissed,
    isInstalled,
    promptInstall,
    dismissPrompt,
    isDismissed,
  };
}
