"use client";

import { useState } from "react";
import { Mail, Send } from "lucide-react";
import { contactAcademy } from "@/app/actions/public/contact-academy";
import { useToast } from "@/components/ui/toast-provider";

interface ContactAcademyFormProps {
  academyId: string;
  academyName: string;
}

export function ContactAcademyForm({ academyId, academyName }: ContactAcademyFormProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    message: "",
  });
  const { pushToast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const result = await contactAcademy({
        academyId,
        ...formData,
      });

      if (result.success) {
        pushToast({
          title: "Mensaje enviado",
          description: result.message || "Tu mensaje ha sido enviado correctamente.",
          variant: "success",
        });
        setFormData({ name: "", email: "", phone: "", message: "" });
        setIsOpen(false);
      } else {
        pushToast({
          title: "Error",
          description: result.error || "No se pudo enviar el mensaje. Intenta de nuevo.",
          variant: "error",
        });
      }
    } catch (error) {
      pushToast({
        title: "Error",
        description: "Ocurrió un error al enviar el mensaje.",
        variant: "error",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-zaltyko-accent to-zaltyko-accent-light px-6 py-3 font-semibold text-zaltyko-primary-dark transition hover:scale-105"
      >
        <Mail className="h-5 w-5" />
        Contactar academia
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl">
        <div className="mb-6 flex items-center justify-between">
          <h3 className="font-display text-xl font-semibold text-foreground">
            Contactar {academyName}
          </h3>
          <button
            onClick={() => setIsOpen(false)}
            className="text-muted-foreground hover:text-foreground"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">
              Nombre *
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full rounded-lg border border-border bg-background px-4 py-2 text-foreground placeholder:text-muted-foreground focus:border-zaltyko-primary focus:outline-none focus:ring-2 focus:ring-zaltyko-primary/20"
              placeholder="Tu nombre"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">
              Email *
            </label>
            <input
              type="email"
              required
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full rounded-lg border border-border bg-background px-4 py-2 text-foreground placeholder:text-muted-foreground focus:border-zaltyko-primary focus:outline-none focus:ring-2 focus:ring-zaltyko-primary/20"
              placeholder="tu@email.com"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">
              Teléfono (opcional)
            </label>
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              className="w-full rounded-lg border border-border bg-background px-4 py-2 text-foreground placeholder:text-muted-foreground focus:border-zaltyko-primary focus:outline-none focus:ring-2 focus:ring-zaltyko-primary/20"
              placeholder="+34 600 000 000"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">
              Mensaje *
            </label>
            <textarea
              required
              rows={4}
              value={formData.message}
              onChange={(e) => setFormData({ ...formData, message: e.target.value })}
              className="w-full rounded-lg border border-border bg-background px-4 py-2 text-foreground placeholder:text-muted-foreground focus:border-zaltyko-primary focus:outline-none focus:ring-2 focus:ring-zaltyko-primary/20"
              placeholder="Escribe tu mensaje aquí..."
            />
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="flex-1 rounded-lg border border-border bg-muted px-4 py-2 font-medium text-foreground transition hover:bg-muted/80"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-zaltyko-primary to-zaltyko-primary-dark px-4 py-2 font-semibold text-white transition hover:scale-105 disabled:opacity-50"
            >
              {isSubmitting ? (
                "Enviando..."
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Enviar
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

