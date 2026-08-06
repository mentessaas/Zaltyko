"use client";

import { useState } from "react";
import { MessageCircle, CheckCircle, XCircle, Loader2 } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

export interface WhatsAppSettings {
  phoneNumber: string;
  apiKey: string;
  notificationsEnabled: boolean;
}

interface WhatsAppSettingsPanelProps {
  settings: WhatsAppSettings;
  onChange: (settings: WhatsAppSettings) => void;
  onVerify: () => Promise<boolean>;
  disabled?: boolean;
}

const DEFAULT_SETTINGS: WhatsAppSettings = {
  phoneNumber: "",
  apiKey: "",
  notificationsEnabled: true,
};

export function WhatsAppSettingsPanel({
  settings,
  onChange,
  onVerify,
  disabled = false,
}: WhatsAppSettingsPanelProps) {
  const [localSettings, setLocalSettings] = useState<WhatsAppSettings>(settings || DEFAULT_SETTINGS);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState<"idle" | "success" | "error">("idle");

  const handleChange = (field: keyof WhatsAppSettings, value: string | boolean) => {
    const newSettings = { ...localSettings, [field]: value };
    setLocalSettings(newSettings);
    onChange(newSettings);
  };

  const handleVerify = async () => {
    setIsVerifying(true);
    setVerificationStatus("idle");

    try {
      const success = await onVerify();
      setVerificationStatus(success ? "success" : "error");
    } catch {
      setVerificationStatus("error");
    } finally {
      setIsVerifying(false);
    }
  };

  const isConfigured = localSettings.phoneNumber && localSettings.apiKey;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageCircle className="h-5 w-5" />
          Configuración de WhatsApp
        </CardTitle>
        <CardDescription>
          Configura tu cuenta de WhatsApp Business para enviar mensajes a atletas y padres
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Número de teléfono */}
        <div className="space-y-2">
          <Label htmlFor="whatsapp-phone">Número de WhatsApp Business</Label>
          <Input
            id="whatsapp-phone"
            type="tel"
            value={localSettings.phoneNumber}
            onChange={(e) => handleChange("phoneNumber", e.target.value)}
            placeholder="+1234567890"
            disabled={disabled}
          />
          <p className="text-xs text-muted-foreground">
            Incluye el código de país sin el signo +
          </p>
        </div>

        {/* API Key */}
        <div className="space-y-2">
          <Label htmlFor="whatsapp-api-key">API Key de WhatsApp Business</Label>
          <Input
            id="whatsapp-api-key"
            type="password"
            value={localSettings.apiKey}
            onChange={(e) => handleChange("apiKey", e.target.value)}
            placeholder="Tu API key"
            disabled={disabled}
          />
          <p className="text-xs text-muted-foreground">
            Obtén tu API key desde el panel de WhatsApp Business API
          </p>
        </div>

        {/* Verificar conexión */}
        <div className="flex items-center gap-4">
          <Button
            type="button"
            onClick={handleVerify}
            disabled={disabled || !isConfigured || isVerifying}
            variant="secondary"
          >
            {isVerifying ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Verificando...
              </>
            ) : (
              "Verificar conexión"
            )}
          </Button>

          {verificationStatus === "success" && (
            <span className="flex items-center gap-1 text-sm text-green-600">
              <CheckCircle className="h-4 w-4" />
              Conexión exitosa
            </span>
          )}

          {verificationStatus === "error" && (
            <span className="flex items-center gap-1 text-sm text-red-600">
              <XCircle className="h-4 w-4" />
              Error de conexión
            </span>
          )}
        </div>

        {/* Notificaciones */}
        <div className="flex items-center justify-between border-t pt-4">
          <div className="space-y-0.5">
            <Label>Notificaciones automáticas</Label>
            <p className="text-sm text-muted-foreground">
              Enviar recordatorios automáticos de clases y pagos
            </p>
          </div>
          <Switch
            checked={localSettings.notificationsEnabled}
            onCheckedChange={(checked) => handleChange("notificationsEnabled", checked)}
            disabled={disabled}
          />
        </div>
      </CardContent>
    </Card>
  );
}

export { DEFAULT_SETTINGS };
