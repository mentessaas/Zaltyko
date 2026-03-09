"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Loader2,
  User,
  BookOpen,
  Users,
  GraduationCap,
  Calendar,
  Building2,
  Plus,
  Clock,
  ArrowRight,
  Command,
} from "lucide-react";

import { useDebounce } from "@/hooks/use-debounce";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";

interface SearchResult {
  type: "athlete" | "class" | "coach" | "group" | "academy" | "event";
  id: string;
  name: string;
  description?: string;
  url: string;
}

interface SearchHistoryItem {
  id: string;
  query: string;
  timestamp: number;
  type?: string;
}

interface GlobalSearchDialogProps {
  academyId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STORAGE_KEY = "zaltyko-search-history";

function getSearchHistory(): SearchHistoryItem[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveSearchHistory(query: string, type?: string) {
  if (typeof window === "undefined" || !query.trim()) return;
  try {
    const history = getSearchHistory();
    const newItem: SearchHistoryItem = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      query: query.trim(),
      timestamp: Date.now(),
      type,
    };
    // Evitar duplicados consecutivos
    const filtered = history.filter((item) => item.query.toLowerCase() !== query.toLowerCase());
    const updated = [newItem, ...filtered].slice(0, 10); // Mantener solo los últimos 10
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // Silently fail
  }
}

function clearSearchHistory() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}

export function GlobalSearchDialog({ academyId, open, onOpenChange }: GlobalSearchDialogProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedType, setSelectedType] = useState<string | undefined>();
  const [history, setHistory] = useState<SearchHistoryItem[]>([]);

  const debouncedQuery = useDebounce(query, 250);

  // Cargar historial al abrir
  useEffect(() => {
    if (open) {
      setHistory(getSearchHistory());
    }
  }, [open]);

  // Realizar búsqueda cuando cambia el query o el tipo
  useEffect(() => {
    if (debouncedQuery.length < 2) {
      setResults([]);
      return;
    }

    const performSearch = async () => {
      setIsLoading(true);
      try {
        const params = new URLSearchParams({
          academyId,
          q: debouncedQuery,
          limit: "15",
        });
        if (selectedType) {
          params.append("type", selectedType);
        }

        const response = await fetch(`/api/search?${params.toString()}`);
        const data = await response.json();

        if (data.items) {
          setResults(data.items);
        }
      } catch (error) {
        console.error("Error performing search:", error);
      } finally {
        setIsLoading(false);
      }
    };

    performSearch();
  }, [debouncedQuery, selectedType, academyId]);

  const handleSelect = useCallback(
    (result: SearchResult) => {
      // Guardar en historial
      saveSearchHistory(query, result.type);
      router.push(result.url);
      onOpenChange(false);
      setQuery("");
      setResults([]);
    },
    [router, onOpenChange, query]
  );

  const handleActionSelect = useCallback(
    (action: string) => {
      const actions: Record<string, string> = {
        "create-athlete": `/app/${academyId}/athletes/new`,
        "create-class": `/app/${academyId}/classes/new`,
        "create-coach": `/app/${academyId}/coaches/new`,
        "create-group": `/app/${academyId}/groups/new`,
        "create-event": `/app/${academyId}/events/new`,
        "go-dashboard": `/app/${academyId}/dashboard`,
        "go-athletes": `/app/${academyId}/athletes`,
        "go-classes": `/app/${academyId}/classes`,
        "go-coaches": `/app/${academyId}/coaches`,
        "go-groups": `/app/${academyId}/groups`,
        "go-events": `/app/${academyId}/events`,
      };

      const url = actions[action];
      if (url) {
        router.push(url);
        onOpenChange(false);
        setQuery("");
      }
    },
    [router, onOpenChange, academyId]
  );

  const getIcon = (type: string) => {
    switch (type) {
      case "athlete":
        return <User className="h-4 w-4" />;
      case "class":
        return <BookOpen className="h-4 w-4" />;
      case "coach":
        return <GraduationCap className="h-4 w-4" />;
      case "group":
        return <Users className="h-4 w-4" />;
      case "event":
        return <Calendar className="h-4 w-4" />;
      case "academy":
        return <Building2 className="h-4 w-4" />;
      default:
        return <Search className="h-4 w-4" />;
    }
  };

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      athlete: "Atleta",
      class: "Clase",
      coach: "Entrenador",
      group: "Grupo",
      event: "Evento",
      academy: "Academia",
    };
    return labels[type] || type;
  };

  // Resaltar el término de búsqueda en el texto
  const highlightMatch = (text: string, searchQuery: string) => {
    if (!searchQuery || searchQuery.length < 2) return text;
    const regex = new RegExp(`(${searchQuery})`, "gi");
    const parts = text.split(regex);
    return parts.map((part, i) =>
      regex.test(part) ? (
        <mark key={i} className="bg-yellow-200 dark:bg-yellow-800 rounded px-0.5">
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  // Agrupar resultados por tipo
  const groupedResults = useMemo(() => {
    const groups: Record<string, SearchResult[]> = {};
    results.forEach((result) => {
      if (!groups[result.type]) {
        groups[result.type] = [];
      }
      groups[result.type].push(result);
    });
    return groups;
  }, [results]);

  const typeFilters = [
    { value: "", label: "Todo" },
    { value: "athlete", label: "Atletas", icon: User },
    { value: "coach", label: "Entrenadores", icon: GraduationCap },
    { value: "class", label: "Clases", icon: BookOpen },
    { value: "group", label: "Grupos", icon: Users },
    { value: "event", label: "Eventos", icon: Calendar },
  ];

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <Command>
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder="Buscar atletas, clases, entrenadores, eventos..."
        />

        {/* Filtros de tipo */}
        <div className="flex gap-1 px-3 py-2 border-b">
          {typeFilters.map((filter) => (
            <button
              key={filter.value}
              onClick={() => setSelectedType(filter.value || undefined)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${
                selectedType === filter.value || (!selectedType && !filter.value)
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {filter.icon && <filter.icon className="h-3 w-3" />}
              {filter.label}
            </button>
          ))}
        </div>

        <CommandList className="max-h-[400px] overflow-y-auto">
          {query.length < 2 && history.length > 0 && (
            <CommandGroup heading="Búsquedas recientes">
              {history.slice(0, 5).map((item) => (
                <CommandItem
                  key={item.id}
                  value={item.query}
                  onSelect={() => setQuery(item.query)}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <Clock className="h-4 w-4 opacity-50" />
                  <span>{item.query}</span>
                  <CommandShortcut className="ml-auto text-xs opacity-50">
                    Press Enter
                  </CommandShortcut>
                </CommandItem>
              ))}
              <CommandItem
                onSelect={() => clearSearchHistory()}
                className="text-xs text-muted-foreground cursor-pointer"
              >
                <span>Limpiar historial</span>
              </CommandItem>
            </CommandGroup>
          )}

          {query.length >= 2 && results.length === 0 && !isLoading && (
            <CommandEmpty className="py-6 text-center text-sm text-muted-foreground">
              No se encontraron resultados para &quot;{query}&quot;
            </CommandEmpty>
          )}

          {/* Acciones rápidas cuando no hay búsqueda */}
          {query.length < 2 && (
            <>
              <CommandGroup heading="Acciones rápidas">
                <CommandItem onSelect={() => handleActionSelect("create-athlete")}>
                  <Plus className="mr-2 h-4 w-4" />
                  <span>Crear atleta</span>
                  <CommandShortcut>⌘A</CommandShortcut>
                </CommandItem>
                <CommandItem onSelect={() => handleActionSelect("create-class")}>
                  <Plus className="mr-2 h-4 w-4" />
                  <span>Crear clase</span>
                  <CommandShortcut>⌘C</CommandShortcut>
                </CommandItem>
                <CommandItem onSelect={() => handleActionSelect("create-coach")}>
                  <Plus className="mr-2 h-4 w-4" />
                  <span>Crear entrenador</span>
                  <CommandShortcut>⌘E</CommandShortcut>
                </CommandItem>
                <CommandItem onSelect={() => handleActionSelect("create-event")}>
                  <Plus className="mr-2 h-4 w-4" />
                  <span>Crear evento</span>
                </CommandItem>
              </CommandGroup>

              <CommandSeparator />

              <CommandGroup heading="Navegación">
                <CommandItem onSelect={() => handleActionSelect("go-dashboard")}>
                  <Building2 className="mr-2 h-4 w-4" />
                  <span>Dashboard</span>
                  <CommandShortcut>⌘D</CommandShortcut>
                </CommandItem>
                <CommandItem onSelect={() => handleActionSelect("go-athletes")}>
                  <User className="mr-2 h-4 w-4" />
                  <span>Ver atletas</span>
                </CommandItem>
                <CommandItem onSelect={() => handleActionSelect("go-classes")}>
                  <BookOpen className="mr-2 h-4 w-4" />
                  <span>Ver clases</span>
                </CommandItem>
                <CommandItem onSelect={() => handleActionSelect("go-events")}>
                  <Calendar className="mr-2 h-4 w-4" />
                  <span>Ver eventos</span>
                </CommandItem>
              </CommandGroup>
            </>
          )}

          {/* Resultados de búsqueda agrupados por tipo */}
          {query.length >= 2 && results.length > 0 && (
            <>
              {Object.entries(groupedResults).map(([type, items]) => (
                <CommandGroup key={type} heading={getTypeLabel(type)}>
                  {items.map((result) => (
                    <CommandItem
                      key={`${result.type}-${result.id}`}
                      value={`${result.name} ${result.description || ""}`}
                      onSelect={() => handleSelect(result)}
                      className="flex items-center gap-3 cursor-pointer"
                    >
                      <div className="flex-shrink-0">{getIcon(result.type)}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {highlightMatch(result.name, query)}
                        </p>
                        {result.description && (
                          <p className="text-xs text-muted-foreground truncate">
                            {highlightMatch(result.description, query)}
                          </p>
                        )}
                      </div>
                      <ArrowRight className="h-4 w-4 opacity-50 shrink-0" />
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
            </>
          )}
        </CommandList>

        {/* Footer con atajos */}
        <div className="flex items-center justify-between px-4 py-2 border-t text-xs text-muted-foreground">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">↑↓</kbd>
              Navegar
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">↵</kbd>
              Seleccionar
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">esc</kbd>
              Cerrar
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Command className="h-3 w-3" />
            <span>K</span>
          </div>
        </div>
      </Command>
    </CommandDialog>
  );
}
