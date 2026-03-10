"use client";

import { useState, useEffect } from "react";
import { Send, Mail, MessageCircle, Loader2, CheckCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface AtRiskAthlete {
  athleteId: string;
  athleteName: string;
  athleteStatus: string;
  parentName: string | null;
  parentEmail: string | null;
  pendingCharges: Array<{
    id: string;
    amount: number;
    period: string;
    dueDate: string | null;
    status: string;
  }>;
  totalPending: number;
  oldestPendingDays: number;
  riskScore: number;
  riskLevel: "high" | "medium" | "low";
  totalPendingFormatted: string;
}

interface PaymentRemindersWidgetProps {
  academyId: string;
}

export function PaymentRemindersWidget({ academyId }: PaymentRemindersWidgetProps) {
  const [athletes, setAthletes] = useState<AtRiskAthlete[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAthlete, setSelectedAthlete] = useState<AtRiskAthlete | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generatedMessage, setGeneratedMessage] = useState<string | null>(null);
  const [sendMethod, setSendMethod] = useState<"email" | "whatsapp">("email");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    loadAtRiskAthletes();
  }, [academyId]);

  const loadAtRiskAthletes = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/ai/billing/at-risk-athletes?academyId=${academyId}`);
      if (response.ok) {
        const data = await response.json();
        setAthletes(data.athletes || []);
      }
    } catch (error) {
      console.error("Error loading at-risk athletes:", error);
    } finally {
      setLoading(false);
    }
  };

  const openReminderDialog = (athlete: AtRiskAthlete) => {
    setSelectedAthlete(athlete);
    setGeneratedMessage(null);
    setSent(false);
    setShowDialog(true);
  };

  const generateReminder = async () => {
    if (!selectedAthlete) return;

    setGenerating(true);
    try {
      const response = await fetch("/api/ai/billing/generate-reminder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          athleteId: selectedAthlete.athleteId,
          name: selectedAthlete.athleteName,
          pendingAmount: selectedAthlete.totalPendingFormatted,
          dueDate: selectedAthlete.pendingCharges[0]?.dueDate || new Date().toISOString(),
          academyName: "Academia",
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setGeneratedMessage(data.message);
      }
    } catch (error) {
      console.error("Error generating reminder:", error);
    } finally {
      setGenerating(false);
    }
  };

  const sendReminder = async () => {
    if (!selectedAthlete || !generatedMessage) return;

    setSending(true);
    try {
      // In a real implementation, this would call an API to send the message
      // For now, we simulate the send
      await new Promise((resolve) => setTimeout(resolve, 1000));
      setSent(true);
    } catch (error) {
      console.error("Error sending reminder:", error);
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-blue-200/50 bg-gradient-to-br from-blue-50/30 via-white to-blue-50/30 p-6 shadow-lg shadow-blue-500/10">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Send className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-blue-600/80">
              Recordatorios
            </p>
            <h3 className="text-lg font-bold text-zaltyko-text-main">
              Cargando...
            </h3>
          </div>
        </div>
      </div>
    );
  }

  if (athletes.length === 0) {
    return (
      <div className="rounded-2xl border border-blue-200/50 bg-gradient-to-br from-blue-50/30 via-white to-blue-50/30 p-6 shadow-lg shadow-blue-500/10">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Send className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-blue-600/80">
              Recordatorios
            </p>
            <h3 className="text-lg font-bold text-zaltyko-text-main">
              Sin recordatorios pendientes
            </h3>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-2xl border border-blue-200/50 bg-gradient-to-br from-blue-50/30 via-white to-blue-50/30 p-6 shadow-lg shadow-blue-500/10">
        <header className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Send className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-blue-600/80">
                Recordatorios automáticos
              </p>
              <h3 className="text-lg font-bold text-zaltyko-text-main">
                Enviar recordatorio
              </h3>
            </div>
          </div>
        </header>

        <div className="space-y-3">
          {athletes.slice(0, 5).map((athlete) => (
            <div
              key={athlete.athleteId}
              className="flex items-center justify-between gap-3 p-3 rounded-xl bg-white/60 border border-blue-100/50 hover:bg-white/80 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-zaltyko-text-main truncate">
                  {athlete.athleteName}
                </p>
                <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{athlete.totalPendingFormatted}</span>
                  <span>·</span>
                  <span>{athlete.parentName || "Sin padre/tutor"}</span>
                </div>
              </div>
              <Button
                size="sm"
                className="shrink-0 h-8 gap-1"
                onClick={() => openReminderDialog(athlete)}
              >
                <Send className="h-3 w-3" />
                <span className="hidden sm:inline">Enviar</span>
              </Button>
            </div>
          ))}
        </div>
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Generar recordatorio de pago</DialogTitle>
            <DialogDescription>
              {selectedAthlete && (
                <>
                  Para {selectedAthlete.athleteName} -{" "}
                  {selectedAthlete.totalPendingFormatted} pendiente
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Método de envío</label>
              <div className="flex gap-2">
                <Button
                  variant={sendMethod === "email" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSendMethod("email")}
                  className="gap-2"
                >
                  <Mail className="h-4 w-4" />
                  Email
                </Button>
                <Button
                  variant={sendMethod === "whatsapp" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSendMethod("whatsapp")}
                  className="gap-2"
                >
                  <MessageCircle className="h-4 w-4" />
                  WhatsApp
                </Button>
              </div>
            </div>

            {!generatedMessage ? (
              <Button
                onClick={generateReminder}
                disabled={generating}
                className="w-full"
              >
                {generating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generando mensaje...
                  </>
                ) : (
                  "Generar mensaje con IA"
                )}
              </Button>
            ) : (
              <div className="space-y-2">
                <label className="text-sm font-medium">Mensaje generado</label>
                <div className="p-3 rounded-lg bg-muted text-sm whitespace-pre-wrap">
                  {generatedMessage}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={generateReminder}
                  disabled={generating}
                  className="w-full"
                >
                  Regenerar mensaje
                </Button>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              Cancelar
            </Button>
            <Button
              onClick={sendReminder}
              disabled={!generatedMessage || sending || sent}
              className="gap-2"
            >
              {sending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Enviando...
                </>
              ) : sent ? (
                <>
                  <CheckCircle className="h-4 w-4" />
                  Enviado
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Enviar recordatorio
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
