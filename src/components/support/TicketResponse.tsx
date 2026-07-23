"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

// Toast placeholder - replace with actual toast implementation
const toast = {
  error: (_msg: string) => { /* Handle error toast */ },
  success: (_msg: string) => { /* Handle success toast */ },
};

interface TicketResponseFormProps {
  ticketId: string;
  isAdmin?: boolean;
  onSuccess?: () => void;
}

export function TicketResponseForm({ ticketId, isAdmin = false, onSuccess }: TicketResponseFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [isInternal, setIsInternal] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!message.trim()) {
      toast.error("Por favor escribe un mensaje");
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
        const data = await response.json();
        throw new Error(data.error || "Error al enviar la respuesta");
      }

      toast.success("Respuesta enviada correctamente");
      setMessage("");
      if (onSuccess) {
        onSuccess();
      } else {
        window.location.reload();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error al enviar la respuesta");
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
            required
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
