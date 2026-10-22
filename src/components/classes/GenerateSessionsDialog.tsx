"use client";

import { useState } from "react";
import { Loader2, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  addCalendarDays,
  addDaysToCalendarDate,
  formatDateToISOString,
  formatCalendarDate,
  parseCalendarDate,
} from "@/lib/date-utils";

const WEEKDAY_LABELS: Record<number, string> = {
  0: "Domingo",
  1: "Lunes",
  2: "Martes",
  3: "Miércoles",
  4: "Jueves",
  5: "Viernes",
  6: "Sábado",
};

interface GenerateSessionsDialogProps {
  classId: string;
  className: string;
  weekdays: number[];
  startTime: string | null;
  endTime: string | null;
  academyCountry?: string | null;
  open: boolean;
  onClose: () => void;
  onGenerated: () => void;
}

export function GenerateSessionsDialog({
  classId,
  className,
  weekdays,
  startTime,
  endTime,
  academyCountry = null,
  open,
  onClose,
  onGenerated,
}: GenerateSessionsDialogProps) {
  const [startDate, setStartDate] = useState(() => {
    return formatDateToISOString(new Date(), academyCountry);
  });
  const [endDate, setEndDate] = useState(() => {
    const today = formatDateToISOString(new Date(), academyCountry);
    return addDaysToCalendarDate(today, 30) ?? today;
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<number | null>(null);

  const calculatePreview = () => {
    if (!startDate || !endDate || weekdays.length === 0) {
      setPreview(null);
      return;
    }

    try {
      const start = parseCalendarDate(startDate);
      const end = parseCalendarDate(endDate);

      if (!start || !end || start > end) {
        setPreview(null);
        return;
      }

      let total = 0;
      for (const targetWeekday of weekdays) {
        let currentDate = new Date(start);
        const startWeekday = currentDate.getUTCDay();
        const targetDay = targetWeekday === 0 ? 7 : targetWeekday;
        const currentDay = startWeekday === 0 ? 7 : startWeekday;
        let daysToAdd = (targetDay - currentDay + 7) % 7;

        if (daysToAdd === 0 && startWeekday !== targetWeekday) {
          daysToAdd = 7;
        }

        currentDate = addCalendarDays(currentDate, daysToAdd);

        if (currentDate < start) {
          currentDate = addCalendarDays(currentDate, 7);
        }

        while (currentDate <= end) {
          total++;
          currentDate = addCalendarDays(currentDate, 7);
        }
      }

      setPreview(total);
    } catch {
      setPreview(null);
    }
  };

  const handleStartDateChange = (value: string) => {
    setStartDate(value);
    setError(null);
    setTimeout(calculatePreview, 100);
  };

  const handleEndDateChange = (value: string) => {
    setEndDate(value);
    setError(null);
    setTimeout(calculatePreview, 100);
  };

  const handleGenerate = async () => {
    if (!startDate || !endDate) {
      setError("Selecciona un rango de fechas válido");
      return;
    }

    if (weekdays.length === 0) {
      setError("Este entrenamiento no tiene días configurados");
      return;
    }

    const start = parseCalendarDate(startDate);
    const end = parseCalendarDate(endDate);

    if (!start || !end) {
      setError("Fechas inválidas");
      return;
    }

    if (start > end) {
      setError("La fecha de inicio debe ser anterior a la fecha de fin");
      return;
    }

    const daysDiff = Math.round((end.getTime() - start.getTime()) / 86_400_000);
    if (daysDiff > 365) {
      setError("El rango máximo es de 365 días (1 año)");
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const response = await fetch(`/api/classes/${classId}/generate-sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          classId,
          startDate: formatCalendarDate(start),
          endDate: formatCalendarDate(end),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || "Error al generar sesiones");
      }

      onGenerated();
      onClose();
    } catch (err: unknown) {
      setError((err instanceof Error ? err.message : "Error desconocido") || "Error al generar sesiones");
    } finally {
      setIsGenerating(false);
    }
  };

  if (weekdays.length === 0) {
    return (
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generar sesiones recurrentes</DialogTitle>
            <DialogDescription>
              Este entrenamiento no tiene días semanales configurados. Configura al menos un día
              en el entrenamiento antes de generar sesiones recurrentes.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Generar sesiones recurrentes</DialogTitle>
          <DialogDescription>
            Genera sesiones automáticamente para <strong>{className}</strong> basándote en los días
            configurados ({weekdays.map((day) => WEEKDAY_LABELS[day]).join(", ")}).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="startDate">Fecha de inicio</Label>
            <Input
              id="startDate"
              type="date"
              value={startDate}
              onChange={(e) => handleStartDateChange(e.target.value)}
              disabled={isGenerating}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="endDate">Fecha de fin</Label>
            <Input
              id="endDate"
              type="date"
              value={endDate}
              onChange={(e) => handleEndDateChange(e.target.value)}
              disabled={isGenerating}
            />
          </div>

          {preview !== null && preview > 0 && (
            <div className="rounded-xl border border-zaltyko-teal/25 bg-zaltyko-teal/10 p-3 text-sm text-foreground">
              <p className="font-medium">
                Se generarán aproximadamente <strong>{preview} sesiones</strong> para los días
                seleccionados en el rango elegido.
              </p>
              {startTime && endTime && (
                <p className="mt-1 text-xs text-zaltyko-teal">
                  Horario: {startTime} – {endTime}
                </p>
              )}
            </div>
          )}

          {preview === 0 && (
            <div className="rounded-xl border border-border bg-zaltyko-warm-white p-3 text-sm text-foreground">
              <p>No se generarán sesiones en el rango seleccionado.</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Asegúrate de que el rango incluya al menos uno de los días configurados.
              </p>
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-zaltyko-coral/35 bg-zaltyko-coral/10 p-3 text-sm text-zaltyko-coral">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isGenerating}>
            Cancelar
          </Button>
          <Button onClick={handleGenerate} disabled={isGenerating || preview === 0}>
            {isGenerating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generando...
              </>
            ) : (
              <>
                <Plus className="mr-2 h-4 w-4" />
                Generar sesiones
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
