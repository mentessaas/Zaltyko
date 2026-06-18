"use client";

import { useState, useEffect } from "react";
import { Loader2, Mail, Bell } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

interface EmailPreferencesProps {
  userId: string;
  initialPreferences?: {
    emailNotifications?: Record<string, boolean>;
    inAppNotifications?: {
      enabled: boolean;
      types: Record<string, boolean>;
    };
  };
}

const NOTIFICATION_TYPES = [
  { key: "attendance_reminders", label: "Recordatorios de asistencia" },
  { key: "payment_reminders", label: "Recordatorios de pago" },
  { key: "event_invitations", label: "Invitaciones a eventos" },
  { key: "class_cancellations", label: "Cancelaciones de clase" },
  { key: "coach_notes", label: "Notas de entrenadores" },
  { key: "system_updates", label: "Actualizaciones del sistema" },
] as const;

export function EmailPreferences({ userId, initialPreferences }: EmailPreferencesProps) {
  const [preferences, setPreferences] = useState<Record<string, boolean>>(
    initialPreferences?.emailNotifications || {}
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleToggle = (key: string) => {
    setPreferences((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/user-preferences/email", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          emailNotifications: preferences,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || "Error al guardar preferencias");
      }

      setSuccess("Preferencias guardadas correctamente");
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message || "Error al guardar preferencias");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5" />
          Preferencias de Notificaciones por Email
        </CardTitle>
        <CardDescription>
          Configura qué notificaciones quieres recibir por correo electrónico
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {NOTIFICATION_TYPES.map((type) => (
          <div key={type.key} className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor={type.key}>{type.label}</Label>
              <p className="text-sm text-muted-foreground">
                Recibir notificaciones por email sobre {type.label.toLowerCase()}
              </p>
            </div>
            <Switch
              id={type.key}
              checked={preferences[type.key] ?? true}
              onCheckedChange={() => handleToggle(type.key)}
            />
          </div>
        ))}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
            {error}
          </div>
        )}

        {success && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900">
            {success}
          </div>
        )}

        <div className="flex justify-end pt-4">
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Guardando...
              </>
            ) : (
              "Guardar preferencias"
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

