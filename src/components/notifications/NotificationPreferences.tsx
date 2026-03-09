"use client";

import { useState, useEffect, useCallback } from "react";
import { Save, Loader2, Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast-provider";

interface NotificationPreferencesData {
  emailNotifications: Record<string, boolean>;
  inAppNotifications: {
    enabled: boolean;
    types: Record<string, boolean>;
  };
  classReminders: {
    enabled: boolean;
    "24h_before": boolean;
    "1h_before": boolean;
  };
}

interface NotificationTypeConfig {
  key: string;
  label: string;
  description: string;
}

const NOTIFICATION_TYPES: NotificationTypeConfig[] = [
  {
    key: "class_reminder",
    label: "Recordatorios de clase",
    description: "Recibe recordatorios antes de tus clases programadas",
  },
  {
    key: "schedule_change",
    label: "Cambios de horario",
    description: "Notificaciones cuando hay cambios en el horario de clases",
  },
  {
    key: "attendance",
    label: "Asistencia",
    description: "Registro de asistencia a clases",
  },
  {
    key: "invoice_pending",
    label: "Facturas pendientes",
    description: "Avisos de facturas pendientes de pago",
  },
  {
    key: "invoice_paid",
    label: "Facturas pagadas",
    description: "Confirmación de pagos recibidos",
  },
  {
    key: "event",
    label: "Eventos",
    description: "Nuevos eventos y recordatorios de eventos",
  },
  {
    key: "message",
    label: "Mensajes",
    description: "Mensajes nuevos de otros usuarios",
  },
  {
    key: "renewal",
    label: "Renovaciones",
    description: "Recordatorios de renovación de membresía",
  },
];

const DEFAULT_PREFERENCES: NotificationPreferencesData = {
  emailNotifications: {
    class_reminder: true,
    schedule_change: true,
    attendance: true,
    invoice_pending: true,
    invoice_paid: true,
    event: true,
    message: true,
    renewal: true,
  },
  inAppNotifications: {
    enabled: true,
    types: {
      class_reminder: true,
      schedule_change: true,
      attendance: true,
      invoice_pending: true,
      invoice_paid: true,
      event: true,
      message: true,
      renewal: true,
    },
  },
  classReminders: {
    enabled: true,
    "24h_before": true,
    "1h_before": false,
  },
};

export function NotificationPreferences() {
  const [preferences, setPreferences] = useState<NotificationPreferencesData>(DEFAULT_PREFERENCES);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const { toast } = useToast();

  // Cargar preferencias
  useEffect(() => {
    async function loadPreferences() {
      try {
        const response = await fetch("/api/notifications/preferences");
        if (response.ok) {
          const data = await response.json();
          if (data.preferences) {
            setPreferences({
              ...DEFAULT_PREFERENCES,
              ...data.preferences,
            });
          }
        }
      } catch (error) {
        console.error("Error loading preferences:", error);
      } finally {
        setIsLoading(false);
      }
    }

    loadPreferences();
  }, []);

  const updatePreference = useCallback(
    (path: string, value: boolean) => {
      setPreferences((prev) => {
        const newPrefs = { ...prev };
        const keys = path.split(".");

        if (keys.length === 2) {
          // Handle nested objects like inAppNotifications.enabled
          (newPrefs as any)[keys[0]] = {
            ...(newPrefs as any)[keys[0]],
            [keys[1]]: value,
          };
        } else {
          (newPrefs as any)[path] = value;
        }

        return newPrefs;
      });
      setHasChanges(true);
    },
    []
  );

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = await fetch("/api/notifications/preferences", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(preferences),
      });

      if (response.ok) {
        setHasChanges(false);
        toast.pushToast({
          title: "Preferencias guardadas",
          description: "Tus preferencias de notificaciones han sido actualizadas",
          variant: "success",
        });
      } else {
        throw new Error("Error al guardar");
      }
    } catch (error) {
      toast.pushToast({
        title: "Error",
        description: "No se pudieron guardar las preferencias",
        variant: "error",
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="p-6">
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="space-y-2">
                    <div className="h-4 w-32 bg-muted rounded animate-pulse" />
                    <div className="h-3 w-48 bg-muted rounded animate-pulse" />
                  </div>
                  <div className="h-6 w-12 bg-muted rounded animate-pulse" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={!hasChanges || isSaving}>
          {isSaving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Guardando...
            </>
          ) : hasChanges ? (
            <>
              <Save className="mr-2 h-4 w-4" />
              Guardar cambios
            </>
          ) : (
            <>
              <Check className="mr-2 h-4 w-4" />
              Guardado
            </>
          )}
        </Button>
      </div>

      {/* In-App Notifications */}
      <Card>
        <CardHeader>
          <CardTitle>Notificaciones en la aplicación</CardTitle>
          <CardDescription>
            Configura las notificaciones que recibes dentro de la aplicación
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Notificaciones habilitadas</Label>
              <p className="text-sm text-muted-foreground">
                Recibe notificaciones dentro de la aplicación
              </p>
            </div>
            <Switch
              checked={preferences.inAppNotifications.enabled}
              onCheckedChange={(checked) => updatePreference("inAppNotifications.enabled", checked)}
            />
          </div>

          {preferences.inAppNotifications.enabled && (
            <div className="border-t pt-4 space-y-4">
              {NOTIFICATION_TYPES.map((type) => (
                <div key={type.key} className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>{type.label}</Label>
                    <p className="text-sm text-muted-foreground">{type.description}</p>
                  </div>
                  <Switch
                    checked={preferences.inAppNotifications.types[type.key] ?? true}
                    onCheckedChange={(checked) =>
                      updatePreference(`inAppNotifications.types.${type.key}`, checked)
                    }
                  />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Email Notifications */}
      <Card>
        <CardHeader>
          <CardTitle>Notificaciones por email</CardTitle>
          <CardDescription>
            Configura qué notificaciones recibes por correo electrónico
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {NOTIFICATION_TYPES.map((type) => (
            <div key={type.key} className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>{type.label}</Label>
                <p className="text-sm text-muted-foreground">{type.description}</p>
              </div>
              <Switch
                checked={preferences.emailNotifications[type.key] ?? true}
                onCheckedChange={(checked) =>
                  updatePreference(`emailNotifications.${type.key}`, checked)
                }
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Class Reminders */}
      <Card>
        <CardHeader>
          <CardTitle>Recordatorios de clase</CardTitle>
          <CardDescription>
            Configura cuándo quieres recibir recordatorios de tus clases
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Habilitar recordatorios</Label>
              <p className="text-sm text-muted-foreground">
                Recibe recordatorios antes de tus clases
              </p>
            </div>
            <Switch
              checked={preferences.classReminders.enabled}
              onCheckedChange={(checked) => updatePreference("classReminders.enabled", checked)}
            />
          </div>

          {preferences.classReminders.enabled && (
            <div className="border-t pt-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>24 horas antes</Label>
                  <p className="text-sm text-muted-foreground">
                    Recibe un recordatorio 24 horas antes de tu clase
                  </p>
                </div>
                <Switch
                  checked={preferences.classReminders["24h_before"]}
                  onCheckedChange={(checked) =>
                    updatePreference("classReminders.24h_before", checked)
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>1 hora antes</Label>
                  <p className="text-sm text-muted-foreground">
                    Recibe un recordatorio 1 hora antes de tu clase
                  </p>
                </div>
                <Switch
                  checked={preferences.classReminders["1h_before"]}
                  onCheckedChange={(checked) =>
                    updatePreference("classReminders.1h_before", checked)
                  }
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Save Button Bottom */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={!hasChanges || isSaving}>
          {isSaving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Guardando...
            </>
          ) : hasChanges ? (
            <>
              <Save className="mr-2 h-4 w-4" />
              Guardar cambios
            </>
          ) : (
            <>
              <Check className="mr-2 h-4 w-4" />
              Guardado
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
