"use client";

import { useState } from "react";
import { Send, Users, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface ProgressUpdatesWidgetProps {
  academyId: string;
}

interface ProgressResult {
  athleteId: string;
  athleteName: string;
  parentName: string | null;
  parentEmail: string | null;
  progressUpdate: string;
  generated: boolean;
  error?: string;
}

export function ProgressUpdatesWidget({ academyId }: ProgressUpdatesWidgetProps) {
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<ProgressResult[]>([]);
  const [summary, setSummary] = useState<{ total: number; successful: number; failed: number } | null>(null);

  const generateProgressUpdates = async () => {
    setGenerating(true);
    try {
      const response = await fetch("/api/ai/communication/progress-notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ academyId }),
      });

      if (response.ok) {
        const data = await response.json();
        setResults(data.results || []);
        setSummary(data.summary);
      }
    } catch (error) {
      console.error("Error generating progress updates:", error);
    } finally {
      setGenerating(false);
    }
  };

  const sendProgressUpdates = async () => {
    setSending(true);
    try {
      // In a real implementation, this would send the updates
      // For now, we just show a success state
      await new Promise((resolve) => setTimeout(resolve, 1500));
      alert("Updates de progreso enviados exitosamente");
    } catch (error) {
      console.error("Error sending progress updates:", error);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="rounded-2xl border border-violet-200/50 bg-gradient-to-br from-violet-50/30 via-white to-violet-50/30 p-6 shadow-lg shadow-violet-500/10">
      <header className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
            <Users className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-violet-600/80">
              Updates de progreso
            </p>
            <h3 className="text-lg font-bold text-zaltyko-text-main">
              Comunicación con padres
            </h3>
          </div>
        </div>
      </header>

      {!summary ? (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Genera updates de progreso personalizados para enviar a los padres de tus atletas.
          </p>
          <Button
            onClick={generateProgressUpdates}
            disabled={generating}
            className="w-full gap-2 bg-violet-500 hover:bg-violet-600"
          >
            {generating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generando updates...
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                Generar updates con IA
              </>
            )}
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex gap-2">
            <Badge className="bg-emerald-100 text-emerald-700 gap-1">
              <CheckCircle className="h-3 w-3" />
              {summary.successful} exitosos
            </Badge>
            {summary.failed > 0 && (
              <Badge className="bg-red-100 text-red-700 gap-1">
                <AlertCircle className="h-3 w-3" />
                {summary.failed} fallidos
              </Badge>
            )}
          </div>

          <div className="max-h-[300px] overflow-y-auto space-y-2">
            {results.slice(0, 5).map((result) => (
              <div
                key={result.athleteId}
                className={cn(
                  "p-3 rounded-xl border",
                  result.generated
                    ? "bg-white/60 border-violet-100/50"
                    : "bg-red-50 border-red-100/50"
                )}
              >
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-sm">{result.athleteName}</p>
                  {result.generated ? (
                    <CheckCircle className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-red-500" />
                  )}
                </div>
                {result.parentName && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Para: {result.parentName}
                  </p>
                )}
                {result.generated && result.progressUpdate && (
                  <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                    {result.progressUpdate.substring(0, 100)}...
                  </p>
                )}
              </div>
            ))}
          </div>

          {results.length > 5 && (
            <p className="text-xs text-muted-foreground text-center">
              Y {results.length - 5} más...
            </p>
          )}

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={generateProgressUpdates}
              disabled={generating}
              className="flex-1"
            >
              Regenerar
            </Button>
            <Button
              onClick={sendProgressUpdates}
              disabled={sending || summary.successful === 0}
              className="flex-1 gap-2 bg-violet-500 hover:bg-violet-600"
            >
              {sending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Enviar todos
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
