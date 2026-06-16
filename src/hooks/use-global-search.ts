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
      // Cmd+K (Mac) or Ctrl+K (Windows/Linux)
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        toggleSearch();
      }

      // Escape to close
      if (event.key === "Escape" && isOpen) {
        event.preventDefault();
        closeSearch();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [enabled, toggleSearch, closeSearch, isOpen]);

  return {
    isOpen,
    openSearch,
    closeSearch,
    toggleSearch,
  };
}
