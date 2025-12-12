"use client";

import { useState, useEffect, FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

interface UserPreferencesFormProps {
  userId: string;
  initialPreferences?: {
    timezone?: string;
    language?: string;
    emailNotifications?: Record<string, boolean>;
  };
  onUpdated?: () => void;
}

const TIMEZONES = [
  { value: "Europe/Madrid", label: "Madrid (GMT+1)" },
  { value: "Europe/London", label: "Londres (GMT+0)" },
  { value: "America/Mexico_City", label: "Ciudad de México (GMT-6)" },
  { value: "America/New_York", label: "Nueva York (GMT-5)" },
  { value: "America/Los_Angeles", label: "Los Ángeles (GMT-8)" },
  { value: "America/Buenos_Aires", label: "Buenos Aires (GMT-3)" },
  { value: "America/Santiago", label: "Santiago (GMT-3)" },
  { value: "America/Bogota", label: "Bogotá (GMT-5)" },
  { value: "Europe/Paris", label: "París (GMT+1)" },
  { value: "Asia/Tokyo", label: "Tokio (GMT+9)" },
];

const LANGUAGES = [
  { value: "es", label: "Español" },
  { value: "en", label: "English" },
  { value: "pt", label: "Português" },
  { value: "fr", label: "Français" },
];

const NOTIFICATION_TYPES = [
  { key: "classReminders", label: "Recordatorios de clases" },
  { key: "attendanceUpdates", label: "Actualizaciones de asistencia" },
  { key: "paymentReminders", label: "Recordatorios de pago" },
  { key: "systemUpdates", label: "Actualizaciones del sistema" },
  { key: "academyNews", label: "Noticias de la academia" },
];

export function UserPreferencesForm({ userId, initialPreferences, onUpdated }: UserPreferencesFormProps) {
  const [timezone, setTimezone] = useState(initialPreferences?.timezone ?? "Europe/Madrid");
  const [language, setLanguage] = useState(initialPreferences?.language ?? "es");
  const [notifications, setNotifications] = useState<Record<string, boolean>>(
    initialPreferences?.emailNotifications ?? {}
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/profile/preferences", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          timezone,
          language,
          emailNotifications: notifications,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || data.error || "Error al actualizar las preferencias");
      }

      setSuccess(true);
      if (onUpdated) {
        onUpdated();
      }

      setTimeout(() => setSuccess(false), 2000);
    } catch (err: any) {
      setError(err.message || "Error al actualizar las preferencias");
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleNotification = (key: string) => {
    setNotifications((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="timezone">Zona horaria</Label>
          <Select
            id="timezone"
            value={timezone}
            onValueChange={setTimezone}
            disabled={isSubmitting}
            className="w-full"
          >
            {TIMEZONES.map((tz) => (
              <option key={tz.value} value={tz.value}>
                {tz.label}
              </option>
            ))}
          </Select>
          <p className="text-xs text-muted-foreground">
            Esta configuración afecta cómo se muestran las fechas y horas en tu cuenta.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="language">Idioma</Label>
          <Select
            id="language"
            value={language}
            onValueChange={setLanguage}
            disabled={isSubmitting}
            className="w-full"
          >
            {LANGUAGES.map((lang) => (
              <option key={lang.value} value={lang.value}>
                {lang.label}
              </option>
            ))}
          </Select>
          <p className="text-xs text-muted-foreground">
            El idioma de la interfaz (próximamente disponible en más idiomas).
          </p>
        </div>

        <div className="space-y-4 rounded-lg border border-border/60 bg-muted/30 p-4">
          <div>
            <h4 className="text-sm font-semibold text-foreground">Notificaciones por email</h4>
            <p className="text-xs text-muted-foreground">
              Elige qué tipos de notificaciones quieres recibir por correo electrónico.
            </p>
          </div>
          <div className="space-y-3">
            {NOTIFICATION_TYPES.map((type) => (
              <div key={type.key} className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">{type.label}</p>
                </div>
                <Switch
                  checked={notifications[type.key] ?? true}
                  onCheckedChange={() => toggleNotification(type.key)}
                  disabled={isSubmitting}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-lg border border-green-500/50 bg-green-500/10 p-3 text-sm text-green-700 dark:text-green-400">
          Preferencias actualizadas correctamente
        </div>
      )}

      <div className="flex items-center justify-end gap-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Guardando..." : "Guardar preferencias"}
        </Button>
      </div>
    </form>
  );
}

