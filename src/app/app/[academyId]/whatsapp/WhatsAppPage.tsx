"use client";

import { useState } from "react";
import { MessageCircle, Send, History, Settings } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { WhatsAppSettingsPanel, DEFAULT_SETTINGS } from "@/components/whatsapp/WhatsAppSettings";
import { WhatsAppMessagePanel, DEFAULT_TEMPLATES } from "@/components/whatsapp/WhatsAppMessagePanel";
import { WhatsAppHistory } from "@/components/whatsapp/WhatsAppHistory";

interface WhatsAppConfig {
  phone: string;
  apiKey: string;
  isConfigured: boolean;
}

interface Recipient {
  id: string;
  name: string;
  phone: string;
}

interface WhatsAppPageProps {
  academyId: string;
  academyName: string;
  whatsappConfig: WhatsAppConfig;
  classes: Array<{ id: string; name: string }>;
  groups: Array<{ id: string; name: string }>;
  recipients: Recipient[];
}

export function WhatsAppPage({
  academyId,
  academyName,
  whatsappConfig: initialConfig,
  classes,
  groups,
  recipients,
}: WhatsAppPageProps) {
  const [config, setConfig] = useState(initialConfig);
  const [activeTab, setActiveTab] = useState("send");

  const handleSendMessage = async (data: {
    recipientType: string;
    recipientIds: string[];
    message: string;
    scheduledAt?: string;
  }) => {
    const response = await fetch("/api/whatsapp/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        academyId,
        ...data,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || "Error sending message");
    }

    return response.json();
  };

  const handleVerifyConnection = async () => {
    const response = await fetch("/api/whatsapp/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: config.phone,
        apiKey: config.apiKey,
      }),
    });

    return response.ok;
  };

  const handleSaveConfig = async () => {
    const response = await fetch(`/api/academies/${academyId}/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        whatsappPhone: config.phone,
        whatsappApiKey: config.apiKey,
      }),
    });

    return response.ok;
  };

  // Mock history data - in production, fetch from API
  const mockHistory = [
    {
      id: "1",
      content: "Recordatorio: Clase de gimansia mañana a las 10:00",
      recipientCount: 15,
      status: "delivered" as const,
      createdAt: new Date(Date.now() - 86400000).toISOString(),
      sentAt: new Date(Date.now() - 86400000).toISOString(),
    },
    {
      id: "2",
      content: "Tienes un pago pendiente de €50",
      recipientCount: 3,
      status: "sent" as const,
      createdAt: new Date(Date.now() - 172800000).toISOString(),
      sentAt: new Date(Date.now() - 172800000).toISOString(),
    },
  ];

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <Breadcrumb
        items={[
          { label: "Dashboard", href: `/app/${academyId}/dashboard` },
          { label: "Mensajería", href: `/app/${academyId}/messages` },
          { label: "WhatsApp" },
        ]}
      />

      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-green-500 to-green-600 text-white shadow-lg shadow-green-500/25">
          <MessageCircle className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">WhatsApp Business</h1>
          <p className="text-muted-foreground">Envía mensajes a atletas y padres de {academyName}</p>
        </div>
      </div>

      {!config.isConfigured && (
        <div className="rounded-lg border border-amber-400/60 bg-amber-400/10 p-4">
          <p className="text-sm text-amber-900 font-medium">
            ⚠️ WhatsApp no est&aacute; configurado. Configura tu cuenta en la pesta&ntilde;a &quot;Configuraci&oacute;n&quot; para poder enviar mensajes.
          </p>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3 lg:w-[400px]">
          <TabsTrigger value="send" className="gap-2">
            <Send className="h-4 w-4" />
            Enviar
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2">
            <History className="h-4 w-4" />
            Historial
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-2">
            <Settings className="h-4 w-4" />
            Configuración
          </TabsTrigger>
        </TabsList>

        <TabsContent value="send" className="mt-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <WhatsAppMessagePanel
              academyId={academyId}
              classes={classes}
              groups={groups}
              recipients={recipients}
              onSend={handleSendMessage}
              disabled={!config.isConfigured}
            />

            {/* Templates Preview */}
            <div className="space-y-4">
              <h3 className="font-semibold">Plantillas disponibles</h3>
              <div className="space-y-3">
                {DEFAULT_TEMPLATES.map((template) => (
                  <div
                    key={template.id}
                    className="rounded-lg border p-4 hover:bg-muted/50 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">{template.name}</span>
                      <span className="text-xs text-muted-foreground capitalize">{template.category}</span>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2">{template.content}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="history" className="mt-6">
          <WhatsAppHistory messages={mockHistory} />
        </TabsContent>

        <TabsContent value="settings" className="mt-6">
          <div className="max-w-2xl">
            <WhatsAppSettingsPanel
              settings={{
                phoneNumber: config.phone,
                apiKey: config.apiKey,
                notificationsEnabled: true,
              }}
              onChange={(newSettings) => {
                setConfig({
                  ...config,
                  phone: newSettings.phoneNumber,
                  apiKey: newSettings.apiKey,
                });
              }}
              onVerify={handleVerifyConnection}
            />

            <div className="mt-4 flex justify-end">
              <button
                onClick={handleSaveConfig}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
              >
                Guardar configuración
              </button>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
