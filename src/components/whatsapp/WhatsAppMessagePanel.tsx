"use client";

import { useState } from "react";
import { Send, Users, User, Clock, Calendar, AlertCircle, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type RecipientType = "all" | "class" | "group" | "selected";
type ScheduleTime = "now" | "later";

interface WhatsAppTemplate {
  id: string;
  name: string;
  content: string;
  category: "reminder" | "payment" | "schedule" | "event" | "custom";
}

const DEFAULT_TEMPLATES: WhatsAppTemplate[] = [
  {
    id: "class-reminder",
    name: "Recordatorio de clase",
    content: "Hola {{name}}, te recordamos que tienes clase de {{class}} mañana a las {{time}}. ¡Te esperamos!",
    category: "reminder",
  },
  {
    id: "payment-reminder",
    name: "Recordatorio de pago",
    content: "Hola {{name}}, tienes un pago pendiente de €{{amount}}. Por favor, realiza el pago lo antes posible.",
    category: "payment",
  },
  {
    id: "schedule-change",
    name: "Cambio de horario",
    content: "Hola {{name}}, informamos que el horario de {{class}} ha cambiado. Nueva hora: {{newTime}}.",
    category: "schedule",
  },
  {
    id: "new-event",
    name: "Nuevo evento",
    content: "Hola {{name}}, se ha publicado un nuevo evento: {{eventName}}. Fecha: {{eventDate}}. ¡Inscríbete ya!",
    category: "event",
  },
  {
    id: "custom",
    name: "Mensaje personalizado",
    content: "",
    category: "custom",
  },
];

interface Recipient {
  id: string;
  name: string;
  phone: string;
}

interface WhatsAppMessagePanelProps {
  academyId: string;
  classes: Array<{ id: string; name: string }>;
  groups: Array<{ id: string; name: string }>;
  recipients: Recipient[];
  onSend: (data: {
    recipientType: RecipientType;
    recipientIds: string[];
    message: string;
    scheduledAt?: string;
  }) => Promise<{ success: boolean; sent: number; errors: string[] }>;
  disabled?: boolean;
}

export function WhatsAppMessagePanel({
  academyId,
  classes,
  groups,
  recipients,
  onSend,
  disabled = false,
}: WhatsAppMessagePanelProps) {
  const [recipientType, setRecipientType] = useState<RecipientType>("all");
  const [selectedClass, setSelectedClass] = useState<string>("");
  const [selectedGroup, setSelectedGroup] = useState<string>("");
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [message, setMessage] = useState("");
  const [scheduleTime, setScheduleTime] = useState<ScheduleTime>("now");
  const [scheduledAt, setScheduledAt] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [result, setResult] = useState<{ success: boolean; sent: number; errors: string[] } | null>(null);

  const handleTemplateSelect = (templateId: string) => {
    const template = DEFAULT_TEMPLATES.find((t) => t.id === templateId);
    if (template) {
      setSelectedTemplate(templateId);
      setMessage(template.content);
    }
  };

  const handleSend = async () => {
    setIsSending(true);
    setResult(null);

    try {
      const recipientIds = selectedRecipients.length > 0
        ? selectedRecipients
        : recipientType === "class"
          ? [selectedClass]
          : recipientType === "group"
            ? [selectedGroup]
            : [];

      const response = await onSend({
        recipientType,
        recipientIds,
        message,
        scheduledAt: scheduleTime === "later" ? scheduledAt : undefined,
      });

      setResult(response);
      if (response.success) {
        setMessage("");
        setSelectedRecipients([]);
      }
    } catch (error) {
      setResult({
        success: false,
        sent: 0,
        errors: ["Error al enviar el mensaje"],
      });
    } finally {
      setIsSending(false);
    }
  };

  const charCount = message.length;
  const maxChars = 4096;
  const isValid = message.length > 0 && (recipientType === "all" || selectedClass || selectedGroup || selectedRecipients.length > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Send className="h-5 w-5" />
          Enviar mensaje de WhatsApp
        </CardTitle>
        <CardDescription>
          Envía mensajes masivos a atletas, padres o grupos específicos
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Templates */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Plantilla de mensaje</label>
          <Select value={selectedTemplate} onValueChange={handleTemplateSelect}>
            <SelectTrigger>
              <SelectValue placeholder="Selecciona una plantilla" />
            </SelectTrigger>
            <SelectContent>
              {DEFAULT_TEMPLATES.map((template) => (
                <SelectItem key={template.id} value={template.id}>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {template.category}
                    </Badge>
                    {template.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Recipient Type */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Destinatarios</label>
          <Select value={recipientType} onValueChange={(v) => setRecipientType(v as RecipientType)}>
            <SelectTrigger>
              <SelectValue placeholder="Selecciona tipo de destinatario" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Todos los atletas y padres
                </div>
              </SelectItem>
              <SelectItem value="class">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Una clase específica
                </div>
              </SelectItem>
              <SelectItem value="group">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Un grupo específico
                </div>
              </SelectItem>
              <SelectItem value="selected">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4" />
                  Seleccionar destinatarios
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Class/Group Selection */}
        {recipientType === "class" && (
          <div className="space-y-2">
            <label className="text-sm font-medium">Seleccionar clase</label>
            <Select value={selectedClass} onValueChange={setSelectedClass}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona una clase" />
              </SelectTrigger>
              <SelectContent>
                {classes.map((cls) => (
                  <SelectItem key={cls.id} value={cls.id}>
                    {cls.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {recipientType === "group" && (
          <div className="space-y-2">
            <label className="text-sm font-medium">Seleccionar grupo</label>
            <Select value={selectedGroup} onValueChange={setSelectedGroup}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona un grupo" />
              </SelectTrigger>
              <SelectContent>
                {groups.map((group) => (
                  <SelectItem key={group.id} value={group.id}>
                    {group.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {recipientType === "selected" && (
          <div className="space-y-2">
            <label className="text-sm font-medium">Seleccionar destinatarios ({selectedRecipients.length} seleccionados)</label>
            <div className="max-h-40 overflow-y-auto border rounded-lg p-2 space-y-1">
              {recipients.map((recipient) => (
                <label
                  key={recipient.id}
                  className={cn(
                    "flex items-center gap-2 p-2 rounded hover:bg-muted cursor-pointer",
                    selectedRecipients.includes(recipient.id) && "bg-primary/10"
                  )}
                >
                  <input
                    type="checkbox"
                    checked={selectedRecipients.includes(recipient.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedRecipients([...selectedRecipients, recipient.id]);
                      } else {
                        setSelectedRecipients(selectedRecipients.filter((id) => id !== recipient.id));
                      }
                    }}
                    className="rounded"
                  />
                  <span className="text-sm">{recipient.name}</span>
                  <span className="text-xs text-muted-foreground">{recipient.phone}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Message */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Mensaje</label>
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Escribe tu mensaje aquí..."
            rows={5}
            disabled={disabled}
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Usa {"{{name}}"} para el nombre del destinatario</span>
            <span className={cn(charCount > maxChars && "text-red-500")}>
              {charCount}/{maxChars}
            </span>
          </div>
        </div>

        {/* Schedule */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Programar envío</label>
          <Select value={scheduleTime} onValueChange={(v) => setScheduleTime(v as ScheduleTime)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="now">
                <div className="flex items-center gap-2">
                  <Send className="h-4 w-4" />
                  Enviar ahora
                </div>
              </SelectItem>
              <SelectItem value="later">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Programar para después
                </div>
              </SelectItem>
            </SelectContent>
          </Select>

          {scheduleTime === "later" && (
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          )}
        </div>

        {/* Result */}
        {result && (
          <div className={cn(
            "rounded-lg border p-4 flex items-center gap-3",
            result.success ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-800"
          )}>
            {result.success ? (
              <CheckCircle className="h-4 w-4" />
            ) : (
              <AlertCircle className="h-4 w-4" />
            )}
            <p className="text-sm">
              {result.success
                ? `Mensaje enviado exitosamente a ${result.sent} destinatario(s)`
                : `Error: ${result.errors.join(", ")}`}
            </p>
          </div>
        )}

        {/* Send Button */}
        <Button
          onClick={handleSend}
          disabled={disabled || !isValid || isSending}
          className="w-full"
        >
          {isSending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Enviando...
            </>
          ) : (
            <>
              <Send className="mr-2 h-4 w-4" />
              {scheduleTime === "now" ? "Enviar mensaje" : "Programar envío"}
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

export { DEFAULT_TEMPLATES };
export type { WhatsAppTemplate, Recipient, RecipientType };
