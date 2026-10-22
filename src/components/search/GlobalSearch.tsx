"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Search, Loader2, User, BookOpen, Users, GraduationCap, Command } from "lucide-react";
import { useRouter } from "next/navigation";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { GlobalSearchDialog } from "./GlobalSearchDialog";
import { useGlobalSearch } from "@/hooks/use-global-search";

interface SearchResult {
  type: "athlete" | "class" | "coach" | "group" | "academy" | "event";
  id: string;
  name: string;
  description?: string;
  url: string;
}

interface GlobalSearchProps {
  academyId: string;
}

export function GlobalSearch({ academyId }: GlobalSearchProps) {
  const { isOpen, openSearch, closeSearch } = useGlobalSearch();

  return (
    <>
      {/* Botón que abre el Command Palette */}
      <Button
        variant="outline"
        className="relative h-9 w-full max-w-md justify-start text-sm text-muted-foreground sm:pr-12 md:w-64 lg:w-80"
        onClick={openSearch}
      >
        <Search className="mr-2 h-4 w-4" />
        <span className="hidden lg:inline-flex">Buscar...</span>
        <span className="inline-flex lg:hidden">Buscar</span>
        <kbd className="pointer-events-none absolute right-1.5 top-1.5 hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
          <span className="text-xs">⌘</span>K
        </kbd>
      </Button>

      {/* Command Palette Dialog */}
      <GlobalSearchDialog
        academyId={academyId}
        open={isOpen}
        onOpenChange={closeSearch}
      />
    </>
  );
}

