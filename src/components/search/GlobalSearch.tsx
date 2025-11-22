"use client";

import { useState, useEffect, useRef } from "react";
import { Search, Loader2, User, BookOpen, Users, GraduationCap } from "lucide-react";
import { useRouter } from "next/navigation";

import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface SearchResult {
  type: "athlete" | "class" | "coach" | "group" | "academy";
  id: string;
  name: string;
  description?: string;
  url: string;
}

interface GlobalSearchProps {
  academyId: string;
}

export function GlobalSearch({ academyId }: GlobalSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    const timeoutId = setTimeout(() => {
      performSearch();
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [query]);

  const performSearch = async () => {
    setIsLoading(true);
    setIsOpen(true);

    try {
      const response = await fetch(`/api/search?academyId=${academyId}&q=${encodeURIComponent(query)}`);
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
      default:
        return <Search className="h-4 w-4" />;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case "athlete":
        return "Atleta";
      case "class":
        return "Clase";
      case "coach":
        return "Entrenador";
      case "group":
        return "Grupo";
      case "academy":
        return "Academia";
      default:
        return type;
    }
  };

  const handleResultClick = (url: string) => {
    router.push(url);
    setIsOpen(false);
    setQuery("");
  };

  return (
    <div className="relative w-full max-w-md" ref={searchRef}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Buscar atletas, clases, entrenadores..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => query.length >= 2 && setIsOpen(true)}
          className="pl-10"
        />
        {isLoading && (
          <Loader2 className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>

      {isOpen && results.length > 0 && (
        <Card className="absolute top-full mt-2 w-full z-50 max-h-96 overflow-y-auto">
          <CardContent className="p-2">
            <div className="space-y-1">
              {results.map((result) => (
                <div
                  key={`${result.type}-${result.id}`}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted cursor-pointer transition-colors"
                  onClick={() => handleResultClick(result.url)}
                >
                  <div className="flex-shrink-0">{getIcon(result.type)}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{result.name}</p>
                    {result.description && (
                      <p className="text-xs text-muted-foreground truncate">
                        {result.description}
                      </p>
                    )}
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {getTypeLabel(result.type)}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {isOpen && query.length >= 2 && !isLoading && results.length === 0 && (
        <Card className="absolute top-full mt-2 w-full z-50">
          <CardContent className="p-4 text-center text-sm text-muted-foreground">
            No se encontraron resultados
          </CardContent>
        </Card>
      )}
    </div>
  );
}

