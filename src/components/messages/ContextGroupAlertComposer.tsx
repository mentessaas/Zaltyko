"use client";

import { memo, useState } from "react";
import { CheckCircle2, Loader2, Megaphone } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export interface MessageSessionContext {
  id: string;
  className: string;
  groupName?: string | null;
  sessionDate: string;
}

interface ContextGroupAlertComposerProps {
  academyId: string;
  session: MessageSessionContext;
  onSent: (conversationId: string) => Promise<void> | void;
}

export const ContextGroupAlertComposer = memo(function ContextGroupAlertComposer({
  academyId,
  session,
  onSent,
}: ContextGroupAlertComposerProps) {
  const [content, setContent] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSend = async () => {
    if (!content.trim() || isSending) return;
    setIsSending(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(
        `/api/messages/group-alert?academyId=${encodeURIComponent(academyId)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: session.id, content: content.trim() }),
        }
      );
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.message ?? "No se pudo enviar el aviso.");
      }

      setContent("");
      setSuccess(
        `Aviso enviado a ${payload.data.recipientCount} ${
          payload.data.recipientCount === 1 ? "cuenta vinculada" : "cuentas vinculadas"
        }.`
      );
      await onSent(payload.data.conversationId);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "No se pudo enviar el aviso.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <section className="border-b bg-primary/5 p-4" aria-labelledby="group-alert-title">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Megaphone className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <h2 id="group-alert-title" className="font-medium text-foreground">
              Aviso a las familias · {session.className}
            </h2>
            <p className="text-xs text-slate-700">
              {session.groupName ? `${session.groupName} · ` : ""}
              {session.sessionDate}. Quedará en el historial interno y generará una notificación.
            </p>
          </div>
          <Textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="Ej.: Hoy terminamos 10 minutos más tarde. Gracias."
            maxLength={2000}
            rows={2}
            aria-label="Contenido del aviso al grupo"
            aria-invalid={Boolean(error)}
          />
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs">
              {error ? <span role="alert" className="text-destructive">{error}</span> : null}
              {success ? (
                <span role="status" className="inline-flex items-center gap-1 text-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                  {success}
                </span>
              ) : null}
            </div>
            <Button
              type="button"
              size="sm"
              onClick={handleSend}
              disabled={!content.trim() || isSending}
              className="min-h-11 sm:min-h-9"
            >
              {isSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              Enviar aviso interno
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
});
