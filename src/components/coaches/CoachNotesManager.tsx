"use client";

import { useState, useEffect } from "react";
import { Plus, Search, Filter, Calendar, User, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { NoteForm } from "./NoteForm";

interface Note {
  id: string;
  athleteId: string;
  athleteName: string;
  note: string;
  sharedWithParents: boolean;
  tags: string[] | null;
  createdAt: string;
  authorId: string;
  authorName: string;
}

interface CoachNotesManagerProps {
  academyId: string;
  athleteId?: string;
  initialNotes?: Note[];
}

export function CoachNotesManager({
  academyId,
  athleteId,
  initialNotes = [],
}: CoachNotesManagerProps) {
  const [notes, setNotes] = useState<Note[]>(initialNotes);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTags, setFilterTags] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const filteredNotes = notes.filter((note) => {
    const matchesSearch =
      note.note.toLowerCase().includes(searchQuery.toLowerCase()) ||
      note.athleteName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTags =
      filterTags.length === 0 ||
      (note.tags && filterTags.some((tag) => note.tags?.includes(tag)));
    const matchesAthlete = !athleteId || note.athleteId === athleteId;
    return matchesSearch && matchesTags && matchesAthlete;
  });

  const allTags = Array.from(
    new Set(notes.flatMap((note) => note.tags || []))
  );

  const handleNoteSaved = () => {
    setIsFormOpen(false);
    setEditingNote(null);
    // Recargar notas
    loadNotes();
  };

  const loadNotes = async () => {
    setIsLoading(true);
    try {
      const url = athleteId
        ? `/api/coach-notes?athleteId=${athleteId}`
        : `/api/coach-notes?academyId=${academyId}`;
      const response = await fetch(url);
      const data = await response.json();
      if (data.items) {
        setNotes(data.items);
      }
    } catch (error) {
      console.error("Error loading notes:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadNotes();
  }, [academyId, athleteId]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Notas de Entrenadores</h2>
          <p className="text-muted-foreground mt-1">
            {athleteId ? "Notas sobre este atleta" : "Gestiona las notas de entrenadores"}
          </p>
        </div>
        <Button onClick={() => setIsFormOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Nueva nota
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Buscar y Filtrar
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Input
              placeholder="Buscar por contenido o nombre de atleta..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          {allTags.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Filtrar por tags:</p>
              <div className="flex flex-wrap gap-2">
                {allTags.map((tag) => (
                  <Badge
                    key={tag}
                    variant={filterTags.includes(tag) ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => {
                      setFilterTags((prev) =>
                        prev.includes(tag)
                          ? prev.filter((t) => t !== tag)
                          : [...prev, tag]
                      );
                    }}
                  >
                    {tag}
                  </Badge>
                ))}
                {filterTags.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setFilterTags([])}
                  >
                    Limpiar filtros
                  </Button>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filteredNotes.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-muted-foreground text-center mb-4">
              {searchQuery || filterTags.length > 0
                ? "No se encontraron notas con los filtros aplicados"
                : "No hay notas creadas aún"}
            </p>
            <Button onClick={() => setIsFormOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Crear primera nota
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredNotes.map((note) => (
            <Card key={note.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{note.athleteName}</span>
                      {note.sharedWithParents && (
                        <Badge variant="outline" className="bg-green-50">
                          Compartida con padres
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {format(new Date(note.createdAt), "PPP", { locale: es })}
                      </span>
                      <span>Por: {note.authorName}</span>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditingNote(note);
                      setIsFormOpen(true);
                    }}
                  >
                    Editar
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-line text-sm">{note.note}</p>
                {note.tags && note.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-4">
                    {note.tags.map((tag, idx) => (
                      <Badge key={idx} variant="secondary">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <NoteForm
        academyId={academyId}
        athleteId={athleteId}
        open={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          setEditingNote(null);
        }}
        note={editingNote || undefined}
        onSaved={handleNoteSaved}
      />
    </div>
  );
}

