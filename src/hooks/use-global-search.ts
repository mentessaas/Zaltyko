"use client";

import { useEffect, useState, useCallback } from "react";

interface UseGlobalSearchOptions {
  enabled?: boolean;
}

export function useGlobalSearch(options: UseGlobalSearchOptions = {}) {
  const { enabled = true } = options;
  const [isOpen, setIsOpen] = useState(false);

  const toggleSearch = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  const openSearch = useCallback(() => {
    setIsOpen(true);
  }, []);

  const closeSearch = useCallback(() => {
    setIsOpen(false);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // Cmd+K (Mac) o Ctrl+K (Windows/Linux). Se registra en fase de captura y
      // se corta la propagacion para que el navegador no se quede el atajo.
      const isToggleShortcut =
        (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
      if (isToggleShortcut) {
        event.preventDefault();
        event.stopPropagation();
        toggleSearch();
        return;
      }

      // Escape solo cierra. Se decide contra el estado funcional para que dos
      // pulsaciones rapidas no puedan reabrir el palet por carreras de render.
      if (event.key === "Escape") {
        event.preventDefault();
        setIsOpen((current) => (current ? false : current));
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [enabled, toggleSearch]);

  return {
    isOpen,
    openSearch,
    closeSearch,
    toggleSearch,
  };
}
