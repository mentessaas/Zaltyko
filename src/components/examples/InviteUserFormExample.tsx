"use client";

import { useState } from "react";
import { FormField, validators } from "@/components/ui/form-field";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast-provider";

/**
 * Ejemplo de uso del componente FormField con validación en tiempo real
 * Este componente demuestra cómo usar FormField en un formulario de invitación de usuario
 */
export function InviteUserFormExample() {
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      // Simular llamada API
      await new Promise((resolve) => setTimeout(resolve, 1000));
      toast.pushToast({
        title: "Usuario invitado",
        description: `Se ha enviado una invitación a ${email}`,
        variant: "success",
      });
      setEmail("");
      setName("");
    } catch (error) {
      toast.pushToast({
        title: "Error",
        description: "No se pudo enviar la invitación",
        variant: "error",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <FormField
        id="email"
        label="Correo electrónico"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        validator={validators.combine(
          validators.required("El correo es obligatorio"),
          validators.email("Ingresa un correo válido")
        )}
        validateOnChange={true}
        validateOnBlur={true}
        placeholder="usuario@ejemplo.com"
        disabled={isSubmitting}
      />

      <FormField
        id="name"
        label="Nombre completo"
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        validator={validators.combine(
          validators.required("El nombre es obligatorio"),
          validators.minLength(2, "El nombre debe tener al menos 2 caracteres"),
          validators.maxLength(100, "El nombre no puede exceder 100 caracteres")
        )}
        validateOnChange={true}
        validateOnBlur={true}
        placeholder="Juan Pérez"
        disabled={isSubmitting}
      />

      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting ? "Enviando..." : "Enviar invitación"}
      </Button>
    </form>
  );
}

