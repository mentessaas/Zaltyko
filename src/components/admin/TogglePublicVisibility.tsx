"use client";

import { useState } from "react";
import { toggleAcademyVisibility } from "@/app/actions/admin/toggle-academy-visibility";
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
  const { showToast } = useToast();

  const handleToggle = async () => {
    setIsLoading(true);
    const newValue = !isPublic;

    try {
      const result = await toggleAcademyVisibility({
        academyId,
        isPublic: newValue,
      });

      if (result.success) {
        setIsPublic(newValue);
        if (onToggle) {
          onToggle(newValue);
        }
        showToast({
          title: "Visibilidad actualizada",
          description: newValue
            ? "La academia ahora es visible en el directorio público."
            : "La academia ya no es visible en el directorio público.",
          variant: "success",
        });
      } else {
        showToast({
          title: "Error",
          description: result.error || "No se pudo actualizar la visibilidad.",
          variant: "error",
        });
      }
    } catch (error) {
      showToast({
        title: "Error",
        description: "Ocurrió un error al actualizar la visibilidad.",
        variant: "error",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button
      onClick={handleToggle}
      disabled={isLoading}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 ${
        isPublic
          ? "bg-zaltyko-accent"
          : "bg-gray-600"
      } ${isLoading ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          isPublic ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

