"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/ui/toast-provider";

interface TogglePublicVisibilityProps {
  academyId: string;
  currentValue: boolean;
  onToggle?: (newValue: boolean) => void;
}

export function TogglePublicVisibility({
  academyId,
  currentValue,
  onToggle,
}: TogglePublicVisibilityProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isPublic, setIsPublic] = useState(currentValue);
  const { pushToast } = useToast();

  useEffect(() => {
    setIsPublic(currentValue);
  }, [currentValue]);

  const handleToggle = async () => {
    setIsLoading(true);
    const newValue = !isPublic;

    try {
      const response = await fetch(`/api/super-admin/academies/${academyId}/public`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ isPublic: newValue }),
      });
      const payload = await response.json().catch(() => null);
      const data = payload && typeof payload === "object" && "data" in payload ? payload.data : null;
      const apiMessage =
        payload && typeof payload === "object" && "message" in payload && typeof payload.message === "string"
          ? payload.message
          : payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
            ? payload.error
            : "No se pudo actualizar la visibilidad.";

      if (!response.ok || !data || typeof data !== "object" || !("isPublic" in data)) {
        pushToast({
          title: "No se pudo actualizar la visibilidad",
          description: apiMessage,
          variant: "error",
        });
        return;
      }

      const confirmedValue = Boolean(data.isPublic);
      setIsPublic(confirmedValue);
      if (onToggle) {
        onToggle(confirmedValue);
      }
      pushToast({
        title: "Visibilidad actualizada",
        description: confirmedValue
          ? "La academia ahora es visible en el directorio público."
          : "La academia ya no es visible en el directorio público.",
        variant: "success",
      });
    } catch (error) {
      pushToast({
        title: "No se pudo actualizar la visibilidad",
        description: error instanceof Error ? error.message : "Revisa la conexión e inténtalo de nuevo.",
        variant: "error",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={isLoading}
      aria-pressed={isPublic}
      aria-busy={isLoading}
      aria-label={isPublic ? "Ocultar academia del directorio público" : "Publicar academia en el directorio público"}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 ${
        isPublic
          ? "bg-zaltyko-accent"
          : "bg-gray-600"
      } ${isLoading ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-card transition-transform ${
          isPublic ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}
