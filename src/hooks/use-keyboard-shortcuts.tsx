"use client";

import { useEffect, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";

interface KeyboardShortcut {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  action: () => void;
  description: string;
}

export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[], enabled = true) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return;

      // Don't trigger shortcuts when typing in inputs
      const target = event.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      for (const shortcut of shortcuts) {
        const ctrlMatch = shortcut.ctrl ? (event.ctrlKey || event.metaKey) : !event.ctrlKey && !event.metaKey;
        const shiftMatch = shortcut.shift ? event.shiftKey : !event.shiftKey;
        const altMatch = shortcut.alt ? event.altKey : !event.altKey;

        if (
          event.key.toLowerCase() === shortcut.key.toLowerCase() &&
          ctrlMatch &&
          shiftMatch &&
          altMatch
        ) {
          event.preventDefault();
          shortcut.action();
          break;
        }
      }
    },
    [shortcuts, enabled]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}

// Common shortcuts for dashboard
export function useDashboardShortcuts(academyId: string, router: ReturnType<typeof useRouter>) {
  const shortcuts: KeyboardShortcut[] = [
    {
      key: "n",
      action: () => router.push(`/app/${academyId}/athletes/new`),
      description: "Nuevo atleta",
    },
    {
      key: "k",
      ctrl: true,
      action: () => router.push(`/app/${academyId}/calendar`),
      description: "Ir al calendario",
    },
    {
      key: "b",
      ctrl: true,
      action: () => router.push(`/app/${academyId}/billing`),
      description: "Ir a facturación",
    },
    {
      key: "d",
      ctrl: true,
      action: () => router.push(`/app/${academyId}/dashboard`),
      description: "Ir al dashboard",
    },
    {
      key: "a",
      ctrl: true,
      action: () => router.push(`/app/${academyId}/athletes`),
      description: "Ir a atletas",
    },
    {
      key: "?",
      action: () => alert("Atajos: N=nuevo atleta, Ctrl+K=calendario, Ctrl+B=facturación, Ctrl+D=dashboard"),
      description: "Mostrar ayuda",
    },
  ];

  useKeyboardShortcuts(shortcuts, true);
}

// Keyboard shortcut list component
export function KeyboardShortcutsHelp() {
  return (
    <div className="text-xs text-muted-foreground space-y-1">
      <p className="font-medium mb-2">Atajos de teclado:</p>
      <div className="grid grid-cols-2 gap-2">
        <span><kbd className="px-1 py-0.5 rounded bg-muted font-mono">N</kbd> Nuevo atleta</span>
        <span><kbd className="px-1 py-0.5 rounded bg-muted font-mono">Ctrl+K</kbd> Calendario</span>
        <span><kbd className="px-1 py-0.5 rounded bg-muted font-mono">Ctrl+B</kbd> Facturación</span>
        <span><kbd className="px-1 py-0.5 rounded bg-muted font-mono">Ctrl+D</kbd> Dashboard</span>
        <span><kbd className="px-1 py-0.5 rounded bg-muted font-mono">Ctrl+A</kbd> Atletas</span>
        <span><kbd className="px-1 py-0.5 rounded bg-muted font-mono">?</kbd> Ver ayuda</span>
      </div>
    </div>
  );
}