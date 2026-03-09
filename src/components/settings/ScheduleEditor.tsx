"use client";

import { useState, useMemo } from "react";
import { Clock, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

export interface ScheduleSlot {
  id: string;
  dayOfWeek: number; // 0 = Domingo, 1 = Lunes, ..., 6 = Sábado
  startTime: string; // HH:mm
  endTime: string; // HH:mm
}

export interface ScheduleData {
  slots: ScheduleSlot[];
}

interface ScheduleEditorProps {
  data: ScheduleData;
  onChange: (data: ScheduleData) => void;
  disabled?: boolean;
}

const DAYS_OF_WEEK = [
  { value: 0, label: "Domingo" },
  { value: 1, label: "Lunes" },
  { value: 2, label: "Martes" },
  { value: 3, label: "Miércoles" },
  { value: 4, label: "Jueves" },
  { value: 5, label: "Viernes" },
  { value: 6, label: "Sábado" },
];

const HOURS = Array.from({ length: 24 }, (_, i) => {
  const hour = i.toString().padStart(2, "0");
  return { value: `${hour}:00`, label: `${hour}:00` };
});

export function ScheduleEditor({ data, onChange, disabled = false }: ScheduleEditorProps) {
  const [editingSlot, setEditingSlot] = useState<Partial<ScheduleSlot> | null>(null);

  const slotsByDay = useMemo(() => {
    const grouped: Record<number, ScheduleSlot[]> = {
      0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: []
    };
    data.slots.forEach((slot) => {
      if (grouped[slot.dayOfWeek]) {
        grouped[slot.dayOfWeek].push(slot);
      }
    });
    // Sort by start time
    Object.keys(grouped).forEach((day) => {
      grouped[Number(day)].sort((a, b) => a.startTime.localeCompare(b.startTime));
    });
    return grouped;
  }, [data.slots]);

  const addSlot = () => {
    const newSlot: ScheduleSlot = {
      id: crypto.randomUUID(),
      dayOfWeek: 1,
      startTime: "09:00",
      endTime: "10:00",
    };
    setEditingSlot(newSlot);
  };

  const saveSlot = () => {
    if (!editingSlot || !editingSlot.dayOfWeek || !editingSlot.startTime || !editingSlot.endTime) {
      return;
    }

    // Validate times
    if (editingSlot.startTime >= editingSlot.endTime) {
      return;
    }

    const existingIndex = data.slots.findIndex((s) => s.id === editingSlot.id);
    let newSlots: ScheduleSlot[];

    if (existingIndex >= 0) {
      newSlots = [...data.slots];
      newSlots[existingIndex] = editingSlot as ScheduleSlot;
    } else {
      newSlots = [...data.slots, editingSlot as ScheduleSlot];
    }

    onChange({ slots: newSlots });
    setEditingSlot(null);
  };

  const deleteSlot = (slotId: string) => {
    onChange({ slots: data.slots.filter((s) => s.id !== slotId) });
  };

  const cancelEdit = () => {
    setEditingSlot(null);
  };

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(":");
    const h = parseInt(hours);
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 || 12;
    return `${h12}:${minutes} ${ampm}`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Horarios de operación
        </CardTitle>
        <CardDescription>
          Define los horarios en los que tu academia está abierta al público
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Vista semanal */}
        <div className="grid gap-4 md:grid-cols-7">
          {DAYS_OF_WEEK.map((day) => (
            <div key={day.value} className="space-y-2">
              <div className="text-center text-sm font-medium">{day.label}</div>
              <div className="min-h-[120px] space-y-2 rounded-md border p-2">
                {slotsByDay[day.value]?.map((slot) => (
                  <div
                    key={slot.id}
                    className="relative rounded bg-primary/10 p-2 text-xs"
                  >
                    <div className="font-medium">
                      {formatTime(slot.startTime)} - {formatTime(slot.endTime)}
                    </div>
                    {!disabled && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute -top-1 -right-1 h-5 w-5 rounded-full"
                        onClick={() => deleteSlot(slot.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                ))}
                {slotsByDay[day.value]?.length === 0 && (
                  <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                    Cerrado
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Editor de nuevo horario */}
        {!disabled && (
          <div className="border-t pt-4">
            {editingSlot ? (
              <div className="rounded-lg border bg-muted/50 p-4">
                <h4 className="mb-4 text-sm font-medium">
                  {editingSlot.id ? "Editar horario" : "Nuevo horario"}
                </h4>
                <div className="grid gap-4 md:grid-cols-4">
                  <div className="space-y-2">
                    <Label>Día de la semana</Label>
                    <select
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={editingSlot.dayOfWeek}
                      onChange={(e) =>
                        setEditingSlot({ ...editingSlot, dayOfWeek: Number(e.target.value) })
                      }
                    >
                      {DAYS_OF_WEEK.map((day) => (
                        <option key={day.value} value={day.value}>
                          {day.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>Hora de inicio</Label>
                    <Input
                      type="time"
                      value={editingSlot.startTime}
                      onChange={(e) =>
                        setEditingSlot({ ...editingSlot, startTime: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Hora de fin</Label>
                    <Input
                      type="time"
                      value={editingSlot.endTime}
                      onChange={(e) =>
                        setEditingSlot({ ...editingSlot, endTime: e.target.value })
                      }
                    />
                  </div>
                  <div className="flex items-end gap-2">
                    <Button onClick={saveSlot} className="flex-1">
                      <Plus className="mr-1 h-4 w-4" />
                      Guardar
                    </Button>
                    <Button variant="outline" onClick={cancelEdit}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <Button variant="outline" onClick={addSlot}>
                <Plus className="mr-2 h-4 w-4" />
                Agregar horario
              </Button>
            )}
          </div>
        )}

        {data.slots.length === 0 && (
          <p className="text-center text-sm text-muted-foreground">
            No hay horarios configurados. Agrega los horarios de operación de tu academia.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
