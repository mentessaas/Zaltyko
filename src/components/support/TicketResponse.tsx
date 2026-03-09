"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface TicketResponseFormProps {
  ticketId: string;
  isAdmin?: boolean;
  onSuccess?: () => void;
}

export function TicketResponseForm({ ticketId, isAdmin = false, onSuccess }: TicketResponseFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState<File[]>([]);

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

      attachments.forEach((file) => {
        formData.append("files", file);
      });

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
      setAttachments([]);
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setAttachments((prev) => [...prev, ...newFiles]);
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
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

          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {attachments.map((file, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 px-3 py-1 bg-secondary rounded-md text-sm"
                >
                  <span className="truncate max-w-[200px]">{file.name}</span>
                  <button
                    type="button"
                    onClick={() => removeAttachment(index)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            multiple
            className="hidden"
          />

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
              >
                Adjuntar archivos
              </Button>
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
