"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

interface AnnouncementFormProps {
  open: boolean;
  onClose: () => void;
  academyId: string;
  onSuccess?: () => void;
}

const PRIORITIES = [
  { value: "low", label: "Baja" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "Alta" },
  { value: "urgent", label: "Urgente" },
];

const CATEGORIES = [
  { value: "general", label: "General" },
  { value: "event", label: "Evento" },
  { value: "billing", label: "Facturación" },
  { value: "class", label: "Clase" },
  { value: "news", label: "Noticias" },
];

export function AnnouncementForm({ open, onClose, academyId, onSuccess }: AnnouncementFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    title: "",
    content: "",
    priority: "normal",
    category: "general",
    actionUrl: "",
    actionLabel: "",
  });

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`/api/academies/${academyId}/announcements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formData.title,
          content: formData.content,
          priority: formData.priority,
          category: formData.category,
          actionUrl: formData.actionUrl || undefined,
          actionLabel: formData.actionLabel || undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || "Error al crear el anuncio");
      }

      setFormData({
        title: "",
        content: "",
        priority: "normal",
        category: "general",
        actionUrl: "",
        actionLabel: "",
      });

      onSuccess?.();
      onClose();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear el anuncio");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Crear nuevo anuncio</DialogTitle>
          <DialogDescription>
            Crea un anuncio para informar a los miembros de tu academia.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="title">Título *</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="Título del anuncio"
              required
              maxLength={200}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="content">Contenido *</Label>
            <Textarea
              id="content"
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              placeholder="Contenido del anuncio..."
              required
              maxLength={5000}
              rows={5}
            />
            <p className="text-xs text-muted-foreground">
              {formData.content.length}/5000 caracteres
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="priority">Prioridad</Label>
              <Select
                value={formData.priority}
                onValueChange={(value) =>
                  setFormData({ ...formData, priority: value })
                }
              >
                <SelectTrigger id="priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">Categoría</Label>
              <Select
                value={formData.category}
                onValueChange={(value) =>
                  setFormData({ ...formData, category: value })
                }
              >
                <SelectTrigger id="category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="actionLabel">Texto del botón (opcional)</Label>
              <Input
                id="actionLabel"
                value={formData.actionLabel}
                onChange={(e) =>
                  setFormData({ ...formData, actionLabel: e.target.value })
                }
                placeholder="ej: Ver detalles"
                maxLength={50}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="actionUrl">URL del botón (opcional)</Label>
              <Input
                id="actionUrl"
                type="url"
                value={formData.actionUrl}
                onChange={(e) =>
                  setFormData({ ...formData, actionUrl: e.target.value })
                }
                placeholder="https://..."
              />
            </div>
          </div>

          {(formData.priority === "high" || formData.priority === "urgent") && (
            <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-700">
              {formData.priority === "urgent" ? (
                <strong>Urgente:</strong>
              ) : (
                <strong>Alta prioridad:</strong>
              )}{" "}
              Los miembros recibirán una notificación push además del mensaje en la app.
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Creando..." : "Crear anuncio"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}