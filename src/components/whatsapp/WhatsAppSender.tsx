"use client";

import { useState, useEffect, useCallback } from "react";
import { Send, Loader2, MessageSquare, Users, Clock, Check, X, Trash2, Edit, Copy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast-provider";

interface MessageTemplate {
  id: string;
  name: string;
  description: string | null;
  channel: string;
  templateType: string;
  subject: string | null;
  body: string;
  variables: string[];
  isSystem: boolean;
  isActive: boolean;
  usageCount: number;
}

interface MessageGroup {
  id: string;
  name: string;
  description: string | null;
  groupType: string;
  memberIds: string[];
  memberCount: number;
}

interface WhatsAppSenderProps {
  academyId: string;
  defaultRecipient?: string;
  onMessageSent?: (data: { channel: string; recipientId: string; body: string }) => void;
}

export function WhatsAppSender({ academyId, defaultRecipient, onMessageSent }: WhatsAppSenderProps) {
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [groups, setGroups] = useState<MessageGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [recipient, setRecipient] = useState(defaultRecipient || "");
  const [messageBody, setMessageBody] = useState("");
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const { pushToast } = useToast();

  // Cargar templates y grupos
  useEffect(() => {
    async function loadData() {
      try {
        const [templatesRes, groupsRes] = await Promise.all([
          fetch(`/api/communication/templates?channel=whatsapp`),
          fetch(`/api/communication/groups`),
        ]);

        if (templatesRes.ok) {
          const templatesData = await templatesRes.json();
          setTemplates(templatesData.items || []);
        }

        if (groupsRes.ok) {
          const groupsData = await groupsRes.json();
          setGroups(groupsData.items || []);
        }
      } catch (error) {
        console.error("Error loading data:", error);
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, [academyId]);

  // Actualizar mensaje cuando se selecciona un template
  const handleTemplateSelect = useCallback((templateId: string) => {
    setSelectedTemplate(templateId);
    const template = templates.find((t) => t.id === templateId);
    if (template) {
      setMessageBody(template.body);
      setVariableValues({});
    }
  }, [templates]);

  // Reemplazar variables en el mensaje
  const getProcessedMessage = useCallback(() => {
    let processed = messageBody;
    Object.entries(variableValues).forEach(([key, value]) => {
      processed = processed.replace(new RegExp(`{{${key}}}`, "g"), value);
    });
    return processed;
  }, [messageBody, variableValues]);

  // Enviar mensaje
  const handleSend = async () => {
    if (!recipient && !selectedGroup) {
      pushToast({
        title: "Error",
        description: "Selecciona un destinatario o grupo",
        variant: "error",
      });
      return;
    }

    if (!messageBody.trim()) {
      pushToast({
        title: "Error",
        description: "Escribe un mensaje",
        variant: "error",
      });
      return;
    }

    setIsSending(true);
    try {
      // Primero, registrar en historial
      await fetch("/api/communication/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: selectedTemplate,
          groupId: selectedGroup,
          channel: "whatsapp",
          body: getProcessedMessage(),
          recipients: selectedGroup
            ? { type: "group", ids: [selectedGroup], count: 1 }
            : { type: "individual", ids: [recipient], count: 1 },
          status: "pending",
        }),
      });

      // Luego, enviar via WhatsApp
      const response = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: recipient,
          message: getProcessedMessage(),
          academyId,
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        // Incrementar uso del template
        if (selectedTemplate) {
          await fetch(`/api/communication/templates/${selectedTemplate}/use`, { method: "PUT" });
        }

        pushToast({
          title: "Mensaje enviado",
          description: `Mensaje enviado a ${recipient}`,
          variant: "success",
        });

        // Reset form
        setRecipient("");
        setSelectedTemplate(null);
        setSelectedGroup(null);
        setMessageBody("");
        setVariableValues({});

        onMessageSent?.({
          channel: "whatsapp",
          recipientId: recipient,
          body: getProcessedMessage(),
        });
      } else {
        throw new Error(data.error || "Error al enviar");
      }
    } catch (error) {
      console.error("Error sending message:", error);
      pushToast({
        title: "Error",
        description: "No se pudo enviar el mensaje",
        variant: "error",
      });
    } finally {
      setIsSending(false);
    }
  };

  // Obtener variables del template seleccionado
  const selectedTemplateData = templates.find((t) => t.id === selectedTemplate);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="space-y-4">
            <div className="h-8 w-32 bg-muted rounded animate-pulse" />
            <div className="h-20 bg-muted rounded animate-pulse" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          Enviar mensaje WhatsApp
        </CardTitle>
        <CardDescription>
          Envía mensajes individuales o a grupos usando templates
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Tabs defaultValue="individual" className="space-y-4">
          <TabsList>
            <TabsTrigger value="individual">Individual</TabsTrigger>
            <TabsTrigger value="group">Grupo</TabsTrigger>
            <TabsTrigger value="templates">Templates</TabsTrigger>
          </TabsList>

          {/* Individual Tab */}
          <TabsContent value="individual" className="space-y-4">
            <div className="space-y-2">
              <Label>Teléfono del destinatario</Label>
              <Input
                placeholder="+34 612 345 678"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Mensaje</Label>
              <Textarea
                placeholder="Escribe tu mensaje..."
                value={messageBody}
                onChange={(e) => setMessageBody(e.target.value)}
                rows={4}
              />
              <p className="text-xs text-muted-foreground">
                Usa {"{{variable}}"} para insertar variables de un template
              </p>
            </div>
          </TabsContent>

          {/* Group Tab */}
          <TabsContent value="group" className="space-y-4">
            <div className="space-y-2">
              <Label>Seleccionar grupo</Label>
              <Select value={selectedGroup || ""} onValueChange={setSelectedGroup}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un grupo" />
                </SelectTrigger>
                <SelectContent>
                  {groups.map((group) => (
                    <SelectItem key={group.id} value={group.id}>
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        <span>{group.name}</span>
                        <Badge variant="outline">{group.memberCount}</Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Mensaje</Label>
              <Textarea
                placeholder="Escribe tu mensaje..."
                value={messageBody}
                onChange={(e) => setMessageBody(e.target.value)}
                rows={4}
              />
            </div>
          </TabsContent>

          {/* Templates Tab */}
          <TabsContent value="templates" className="space-y-4">
            <div className="space-y-2">
              <Label>Seleccionar template</Label>
              <Select value={selectedTemplate || ""} onValueChange={handleTemplateSelect}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un template" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      <div className="flex items-center gap-2">
                        <span>{template.name}</span>
                        {template.isSystem && <Badge variant="outline">Sistema</Badge>}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedTemplateData && selectedTemplateData.variables.length > 0 && (
              <div className="border-t pt-4 space-y-3">
                <Label>Variables</Label>
                {selectedTemplateData.variables.map((variable) => (
                  <div key={variable} className="flex items-center gap-2">
                    <Label className="w-32">{variable}</Label>
                    <Input
                      placeholder={`Valor para ${variable}`}
                      value={variableValues[variable] || ""}
                      onChange={(e) =>
                        setVariableValues((prev) => ({ ...prev, [variable]: e.target.value }))
                      }
                    />
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-2">
              <Label>Vista previa del mensaje</Label>
              <div className="p-3 bg-muted rounded-lg text-sm whitespace-pre-wrap">
                {getProcessedMessage() || "Selecciona un template y completa las variables"}
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {/* Send Button */}
        <div className="flex justify-end gap-2">
          <Button
            onClick={handleSend}
            disabled={isSending || (!recipient && !selectedGroup) || !messageBody.trim()}
          >
            {isSending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Enviando...
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Enviar mensaje
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
