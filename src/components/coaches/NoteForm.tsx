"use client";

import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";

interface Note {
  id: string;
  athleteId: string;
  note: string;
  sharedWithParents: boolean;
  tags: string[] | null;
}

interface NoteFormProps {
  academyId: string;
  athleteId?: string;
  open: boolean;
  onClose: () => void;
  note?: Note;
  onSaved: () => void;
}

export function NoteForm({
  academyId,
  athleteId,
  open,
  onClose,
  note,
  onSaved,
}: NoteFormProps) {
  const [selectedAthleteId, setSelectedAthleteId] = useState(athleteId || "");
  const [noteText, setNoteText] = useState("");
  const [sharedWithParents, setSharedWithParents] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [athletes, setAthletes] = useState<Array<{ id: string; name: string }>>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      if (note) {
        setSelectedAthleteId(note.athleteId);
        setNoteText(note.note);
        setSharedWithParents(note.sharedWithParents);
        setTags(note.tags || []);
      } else {
        setSelectedAthleteId(athleteId || "");
        setNoteText("");
        setSharedWithParents(false);
        setTags([]);
      }
      setError(null);
      loadAthletes();
    }
  }, [open, note, athleteId]);

  const loadAthletes = async () => {
    try {
      const response = await fetch(`/api/athletes?academyId=${academyId}`);
      const data = await response.json();
      if (data.items) {
        setAthletes(data.items);
      }
    } catch (error) {
      console.error("Error loading athletes:", error);
    }
  };

  const handleAddTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()]);
      setTagInput("");
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((tag) => tag !== tagToRemove));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);

    if (!selectedAthleteId) {
      setError("Selecciona un atleta");
      setIsSaving(false);
      return;
    }

    if (!noteText.trim()) {
      setError("La nota no puede estar vacía");
      setIsSaving(false);
      return;
    }

    try {
      const url = note ? `/api/coach-notes/${note.id}` : "/api/coach-notes";
      const method = note ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          athleteId: selectedAthleteId,
          note: noteText,
          sharedWithParents,
          tags: tags.length > 0 ? tags : null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || "Error al guardar nota");
      }

      onSaved();
    } catch (err: any) {
      setError(err.message || "Error al guardar nota");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>{note ? "Editar nota" : "Nueva nota"}</DialogTitle>
          <DialogDescription>
            {note
              ? "Modifica la información de la nota"
              : "Crea una nueva nota sobre un atleta"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            {!athleteId && (
              <div className="space-y-2">
                <Label htmlFor="athlete">Atleta *</Label>
                <select
                  id="athlete"
                  value={selectedAthleteId}
                  onChange={(e) => setSelectedAthleteId(e.target.value)}
                  required
                  disabled={isSaving}
                  className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="">Selecciona un atleta</option>
                  {athletes.map((athlete) => (
                    <option key={athlete.id} value={athlete.id}>
                      {athlete.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="note">Nota *</Label>
              <Textarea
                id="note"
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                required
                rows={6}
                disabled={isSaving}
                placeholder="Escribe tu nota sobre el atleta..."
                className="resize-none"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tags">Tags (opcional)</Label>
              <div className="flex gap-2">
                <Input
                  id="tags"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddTag();
                    }
                  }}
                  placeholder="Añadir tag..."
                  disabled={isSaving}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleAddTag}
                  disabled={isSaving || !tagInput.trim()}
                >
                  Añadir
                </Button>
              </div>
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {tags.map((tag) => (
                    <Badge
                      key={tag}
                      variant="secondary"
                      className="cursor-pointer"
                      onClick={() => handleRemoveTag(tag)}
                    >
                      {tag} ×
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="shared">Compartir con padres</Label>
                <p className="text-sm text-muted-foreground">
                  Si está activado, los padres del atleta podrán ver esta nota
                </p>
              </div>
              <Switch
                id="shared"
                checked={sharedWithParents}
                onCheckedChange={setSharedWithParents}
                disabled={isSaving}
              />
            </div>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
                {error}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSaving || !noteText.trim()}>
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Guardando...
                </>
              ) : (
                "Guardar nota"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

