"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast-provider";

interface TicketResponseFormProps {
  ticketId: string;
  isAdmin?: boolean;
  onSuccess?: () => void;
}

export function TicketResponseForm({ ticketId, isAdmin = false, onSuccess }: TicketResponseFormProps) {
  const { pushToast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [isInternal, setIsInternal] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!message.trim()) {
      pushToast({
        title: "Escribe una respuesta",
        description: "El mensaje no puede estar vacío.",
        variant: "warning",
      });
      return;
    }

    setIsLoading(true);
    try {
      const formData = new FormData();
      formData.append("message", message);
      if (isAdmin) {
        formData.append("isInternal", String(isInternal));
      }

      const response = await fetch(`/api/support/tickets/${ticketId}/responses`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        const apiMessage =
          data && typeof data === "object" && "message" in data && typeof data.message === "string"
            ? data.message
            : data && typeof data === "object" && "error" in data && typeof data.error === "string"
              ? data.error
              : "No se pudo enviar la respuesta.";
        throw new Error(apiMessage);
      }

      pushToast({
        title: "Respuesta enviada",
        description: isInternal ? "Solo visible para el equipo de soporte." : "El ticket se ha actualizado.",
        variant: "success",
      });
      setMessage("");
      if (onSuccess) {
        onSuccess();
      } else {
        window.location.reload();
      }
    } catch (error) {
      pushToast({
        title: "No se pudo enviar la respuesta",
        description: error instanceof Error ? error.message : "Inténtalo de nuevo.",
        variant: "error",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Responder</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Textarea
            placeholder="Escribe tu respuesta..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            maxLength={10_000}
            aria-label="Respuesta"
          />

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {isAdmin && (
                <div className="flex items-center gap-2">
                  <Switch
                    id="internal"
                    checked={isInternal}
                    onCheckedChange={setIsInternal}
                  />
                  <Label htmlFor="internal" className="text-sm">
                    Respuesta interna
                  </Label>
                </div>
              )}
            </div>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Enviando..." : "Enviar respuesta"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
