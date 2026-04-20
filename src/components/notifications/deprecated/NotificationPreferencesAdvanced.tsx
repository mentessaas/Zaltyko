"use client";

import { useState, useEffect, useCallback } from "react";
import { Save, Loader2, Check, Clock, Bell, Mail, MessageSquare, Smartphone, Moon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast-provider";

interface NotificationPreferencesData {
  channels: {
    inApp: { enabled: boolean; types: Record<string, boolean> };
    email: { enabled: boolean; types: Record<string, boolean> };
    whatsapp: { enabled: boolean; types: Record<string, boolean> };
    push: { enabled: boolean; types: Record<string, boolean> };
  };
  reminders: {
    classReminder: { enabled: boolean; timing: string[] };
    paymentReminder: { enabled: boolean; daysBefore: number[] };
    attendanceAlert: boolean;
  };
  quietHours: {
    enabled: boolean;
    start: string;
    end: string;
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
    description: "Notificaciones cuando hay cambios en el horario",
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
    description: "Nuevos eventos y recordatorios",
  },
  {
    key: "message",
    label: "Mensajes",
    description: "Mensajes nuevos de otros usuarios",
  },
  {
    key: "renewal",
    label: "Renovaciones",
    description: "Recordatorios de renovación",
  },
];

const DEFAULT_PREFERENCES: NotificationPreferencesData = {
  channels: {
    inApp: { enabled: true, types: { class_reminder: true, schedule_change: true, attendance: true, invoice_pending: true, invoice_paid: true, event: true, message: true, renewal: true } },
    email: { enabled: true, types: { class_reminder: true, schedule_change: true, attendance: true, invoice_pending: true, invoice_paid: true, event: true, message: true, renewal: true } },
    whatsapp: { enabled: true, types: { class_reminder: true, payment_reminder: true, attendance: true } },
    push: { enabled: true, types: { class_reminder: true, schedule_change: true, attendance: true, invoice_pending: true } },
  },
  reminders: {
    classReminder: { enabled: true, timing: ["24h", "1h"] },
    paymentReminder: { enabled: true, daysBefore: [7, 3, 1] },
    attendanceAlert: true,
  },
  quietHours: { enabled: false, start: "22:00", end: "08:00" },
};

export function NotificationPreferencesAdvanced() {
  const [preferences, setPreferences] = useState<NotificationPreferencesData>(DEFAULT_PREFERENCES);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const { pushToast } = useToast();

  // Cargar preferencias
  useEffect(() => {
    async function loadPreferences() {
      try {
        const response = await fetch("/api/communication/preferences");
        if (response.ok) {
          const data = await response.json();
          if (data.channels) {
            setPreferences({
              ...DEFAULT_PREFERENCES,
              channels: data.channels,
              reminders: data.reminders || DEFAULT_PREFERENCES.reminders,
              quietHours: data.quietHours || DEFAULT_PREFERENCES.quietHours,
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

  const updatePreference = useCallback((path: string, value: unknown) => {
    setPreferences((prev) => {
      const newPrefs = JSON.parse(JSON.stringify(prev));
      const keys = path.split(".");

      let current: Record<string, unknown> = newPrefs;
      for (let i = 0; i < keys.length - 1; i++) {
        current = current[keys[i]] as Record<string, unknown>;
      }
      current[keys[keys.length - 1]] = value;

      return newPrefs;
    });
    setHasChanges(true);
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = await fetch("/api/communication/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(preferences),
      });

      if (response.ok) {
        setHasChanges(false);
        pushToast({
          title: "Preferencias guardadas",
          description: "Tus preferencias de notificaciones han sido actualizadas",
          variant: "success",
        });
      } else {
        throw new Error("Error al guardar");
      }
    } catch (error) {
      pushToast({
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

      <Tabs defaultValue="channels" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="channels">Canales</TabsTrigger>
          <TabsTrigger value="reminders">Recordatorios</TabsTrigger>
          <TabsTrigger value="quiet">Horario</TabsTrigger>
          <TabsTrigger value="types">Por tipo</TabsTrigger>
        </TabsList>

        {/* Channels Tab */}
        <TabsContent value="channels" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Notificaciones en-app
              </CardTitle>
              <CardDescription>
                Recibe notificaciones dentro de la aplicación
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Habilitado</Label>
                  <p className="text-sm text-muted-foreground">
                    Mostrar notificaciones en la app
                  </p>
                </div>
                <Switch
                  checked={preferences.channels.inApp.enabled}
                  onCheckedChange={(checked) => updatePreference("channels.inApp.enabled", checked)}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                Email
              </CardTitle>
              <CardDescription>
                Recibe notificaciones por correo electrónico
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Habilitado</Label>
                  <p className="text-sm text-muted-foreground">
                    Enviar notificaciones por email
                  </p>
                </div>
                <Switch
                  checked={preferences.channels.email.enabled}
                  onCheckedChange={(checked) => updatePreference("channels.email.enabled", checked)}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                WhatsApp
              </CardTitle>
              <CardDescription>
                Recibe notificaciones por WhatsApp
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Habilitado</Label>
                  <p className="text-sm text-muted-foreground">
                    Enviar notificaciones por WhatsApp
                  </p>
                </div>
                <Switch
                  checked={preferences.channels.whatsapp.enabled}
                  onCheckedChange={(checked) => updatePreference("channels.whatsapp.enabled", checked)}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Smartphone className="h-5 w-5" />
                Push Notifications
              </CardTitle>
              <CardDescription>
                Recibe notificaciones push en tu dispositivo
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Habilitado</Label>
                  <p className="text-sm text-muted-foreground">
                    Recibir notificaciones push
                  </p>
                </div>
                <Switch
                  checked={preferences.channels.push.enabled}
                  onCheckedChange={(checked) => updatePreference("channels.push.enabled", checked)}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Reminders Tab */}
        <TabsContent value="reminders" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Recordatorios de clase
              </CardTitle>
              <CardDescription>
                Configura cuándo quieres recibir recordatorios
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Habilitar recordatorios</Label>
                </div>
                <Switch
                  checked={preferences.reminders.classReminder.enabled}
                  onCheckedChange={(checked) => updatePreference("reminders.classReminder.enabled", checked)}
                />
              </div>

              {preferences.reminders.classReminder.enabled && (
                <div className="border-t pt-4 space-y-3">
                  <Label>Timing</Label>
                  {["24h", "2h", "1h"].map((timing) => (
                    <div key={timing} className="flex items-center justify-between">
                      <span className="text-sm">{timing === "24h" ? "24 horas antes" : timing === "2h" ? "2 horas antes" : "1 hora antes"}</span>
                      <Switch
                        checked={preferences.reminders.classReminder.timing.includes(timing)}
                        onCheckedChange={(checked) => {
                          const newTiming = checked
                            ? [...preferences.reminders.classReminder.timing, timing]
                            : preferences.reminders.classReminder.timing.filter((t) => t !== timing);
                          updatePreference("reminders.classReminder.timing", newTiming);
                        }}
                      />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recordatorios de pago</CardTitle>
              <CardDescription>
                Cuántos días antes del vencimiento recibir recordatorios
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Habilitar recordatorios</Label>
                </div>
                <Switch
                  checked={preferences.reminders.paymentReminder.enabled}
                  onCheckedChange={(checked) => updatePreference("reminders.paymentReminder.enabled", checked)}
                />
              </div>

              {preferences.reminders.paymentReminder.enabled && (
                <div className="border-t pt-4 space-y-3">
                  <Label>Notificar días antes</Label>
                  {[14, 7, 3, 1].map((days) => (
                    <div key={days} className="flex items-center justify-between">
                      <span className="text-sm">{days} día{days > 1 ? "s" : ""}</span>
                      <Switch
                        checked={preferences.reminders.paymentReminder.daysBefore.includes(days)}
                        onCheckedChange={(checked) => {
                          const newDays = checked
                            ? [...preferences.reminders.paymentReminder.daysBefore, days]
                            : preferences.reminders.paymentReminder.daysBefore.filter((d) => d !== days);
                          updatePreference("reminders.paymentReminder.daysBefore", newDays);
                        }}
                      />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Alertas de asistencia</CardTitle>
              <CardDescription>
                Recibe alertas cuando un alumno falta a clase
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <Label>Habilitar alertas</Label>
                <Switch
                  checked={preferences.reminders.attendanceAlert}
                  onCheckedChange={(checked) => updatePreference("reminders.attendanceAlert", checked)}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Quiet Hours Tab */}
        <TabsContent value="quiet" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Moon className="h-5 w-5" />
                Horario silencioso
              </CardTitle>
              <CardDescription>
                Silencia las notificaciones durante ciertos horarios
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Habilitar horario silencioso</Label>
                  <p className="text-sm text-muted-foreground">
                    No molestar durante las horas especificadas
                  </p>
                </div>
                <Switch
                  checked={preferences.quietHours.enabled}
                  onCheckedChange={(checked) => updatePreference("quietHours.enabled", checked)}
                />
              </div>

              {preferences.quietHours.enabled && (
                <div className="border-t pt-4 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Inicio</Label>
                      <Input
                        type="time"
                        value={preferences.quietHours.start}
                        onChange={(e) => updatePreference("quietHours.start", e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Fin</Label>
                      <Input
                        type="time"
                        value={preferences.quietHours.end}
                        onChange={(e) => updatePreference("quietHours.end", e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Types Tab */}
        <TabsContent value="types" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Notificaciones por tipo</CardTitle>
              <CardDescription>
                Selecciona qué notificaciones quieres recibir por cada canal
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {NOTIFICATION_TYPES.map((type) => (
                  <div key={type.key} className="border-b pb-4 last:border-0">
                    <div className="mb-3">
                      <Label className="text-base">{type.label}</Label>
                      <p className="text-sm text-muted-foreground">{type.description}</p>
                    </div>
                    <div className="grid grid-cols-4 gap-4">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={preferences.channels.inApp.types[type.key] ?? true}
                          onCheckedChange={(checked) =>
                            updatePreference(`channels.inApp.types.${type.key}`, checked)
                          }
                        />
                        <Label className="text-sm">En-app</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={preferences.channels.email.types[type.key] ?? true}
                          onCheckedChange={(checked) =>
                            updatePreference(`channels.email.types.${type.key}`, checked)
                          }
                        />
                        <Label className="text-sm">Email</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={preferences.channels.whatsapp.types[type.key] ?? false}
                          onCheckedChange={(checked) =>
                            updatePreference(`channels.whatsapp.types.${type.key}`, checked)
                          }
                        />
                        <Label className="text-sm">WhatsApp</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={preferences.channels.push.types[type.key] ?? true}
                          onCheckedChange={(checked) =>
                            updatePreference(`channels.push.types.${type.key}`, checked)
                          }
                        />
                        <Label className="text-sm">Push</Label>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

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
