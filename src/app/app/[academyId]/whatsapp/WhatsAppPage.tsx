"use client";

import { useEffect, useMemo, useState } from "react";
import { MessageCircle, Send, History, Settings } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { WhatsAppSettingsPanel, DEFAULT_SETTINGS } from "@/components/whatsapp/WhatsAppSettings";
import { WhatsAppMessagePanel, type WhatsAppTemplate } from "@/components/whatsapp/WhatsAppMessagePanel";
import { WhatsAppHistory, type MessageStatus, type WhatsAppMessage } from "@/components/whatsapp/WhatsAppHistory";
import { getTerminologyForSportConfig } from "@/lib/sport-config/terminology";

interface WhatsAppConfig {
  phone: string;
  apiKey: string;
  isConfigured: boolean;
}

interface Recipient {
  id: string;
  name: string;
  phone: string;
  sportConfigId: string | null;
}

interface WhatsAppPageProps {
  academyId: string;
  academyName: string;
  whatsappConfig: WhatsAppConfig;
  classes: Array<{ id: string; name: string; sportConfigId: string | null }>;
  groups: Array<{ id: string; name: string; sportConfigId: string | null }>;
  recipients: Recipient[];
  sportConfigs: Array<{ id: string; branchName: string; disciplineName: string; terminology?: Record<string, string> }>;
  templates: WhatsAppTemplate[];
}

export function WhatsAppPage({
  academyId,
  academyName,
  whatsappConfig: initialConfig,
  classes,
  groups,
  recipients,
  sportConfigs,
  templates,
}: WhatsAppPageProps) {
  const [config, setConfig] = useState(initialConfig);
  const [activeTab, setActiveTab] = useState("send");
  const [historySportConfig, setHistorySportConfig] = useState("");
  const [historyMessages, setHistoryMessages] = useState<WhatsAppMessage[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);

  const sportConfigNameById = useMemo(
    () => new Map(sportConfigs.map((config) => [config.id, `${config.branchName} · ${config.disciplineName}`])),
    [sportConfigs]
  );
  const terms = getTerminologyForSportConfig(sportConfigs, historySportConfig);

  const handleSendMessage = async (data: {
    recipientType: string;
    recipientIds: string[];
    sportConfigId?: string;
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

  useEffect(() => {
    if (activeTab !== "history") return;

    const loadHistory = async () => {
      setIsHistoryLoading(true);
      try {
        const params = new URLSearchParams({
          academyId,
          channel: "whatsapp",
          limit: "50",
        });
        if (historySportConfig) {
          params.set("sportConfigId", historySportConfig);
        }

        const response = await fetch(`/api/communication/history?${params.toString()}`, {
          headers: { "x-academy-id": academyId },
        });
        if (!response.ok) {
          setHistoryMessages([]);
          return;
        }

        const payload = await response.json();
        const items = payload.data?.items ?? [];
        setHistoryMessages(items.map((item: {
          id: string;
          body: string;
          status: MessageStatus;
          sportConfigId: string | null;
          createdAt: string;
          sentAt: string | null;
          failedAt: string | null;
          meta: { errorMessage?: string } | null;
        }) => ({
          id: item.id,
          content: item.body,
          recipientCount: 1,
          status: item.status,
          sportConfigName: item.sportConfigId ? sportConfigNameById.get(item.sportConfigId) ?? "Rama configurada" : null,
          createdAt: item.createdAt,
          sentAt: item.sentAt ?? undefined,
          failureReason: item.meta?.errorMessage ?? (item.failedAt ? "Error de envío" : undefined),
        })));
      } finally {
        setIsHistoryLoading(false);
      }
    };

    void loadHistory();
  }, [academyId, activeTab, historySportConfig, sportConfigNameById]);

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
        <div className="flex h-12 w-12 items-center justify-center rounded-control bg-green-50">
          <MessageCircle className="h-6 w-6 text-green-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">WhatsApp Business</h1>
          <p className="text-muted-foreground">
            Envía mensajes a {terms.athletes.toLowerCase()} y {terms.parent.toLowerCase()}s de {academyName}
          </p>
        </div>
      </div>

      {!config.isConfigured && (
        <div className="rounded-card border border-zaltyko-coral/30 bg-zaltyko-coral/10 p-4">
          <p className="text-sm font-medium text-zaltyko-navy">
            WhatsApp no está configurado. Configura tu cuenta en la pestaña &quot;Configuración&quot; para poder enviar mensajes.
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
              sportConfigs={sportConfigs}
              templates={templates}
              onSend={handleSendMessage}
              disabled={!config.isConfigured}
            />

            {/* Templates Preview */}
            <div className="space-y-4">
              <h3 className="font-semibold">Plantillas disponibles</h3>
              <div className="space-y-3">
                {templates.map((template) => (
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
          <div className="space-y-4">
            {sportConfigs.length > 0 && (
              <div className="max-w-sm">
                <select
                  value={historySportConfig}
                  onChange={(event) => setHistorySportConfig(event.target.value)}
                  className="h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                >
                  <option value="">Todas las ramas</option>
                  {sportConfigs.map((config) => (
                    <option key={config.id} value={config.id}>
                      {config.branchName} · {config.disciplineName}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <WhatsAppHistory messages={historyMessages} isLoading={isHistoryLoading} />
          </div>
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
