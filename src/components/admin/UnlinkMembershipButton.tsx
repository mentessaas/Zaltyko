"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Unlink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast-provider";

interface UnlinkMembershipButtonProps {
  membershipId: string;
  label?: string;
}

export function UnlinkMembershipButton({
  membershipId,
  label = "Desvincular",
}: UnlinkMembershipButtonProps) {
  const router = useRouter();
  const toast = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleClick() {
    const confirmed = window.confirm(
      "Esto quitara el acceso a esta academia, pero la cuenta global del usuario se conserva."
    );
    if (!confirmed) {
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/academy-memberships/${membershipId}`, {
        method: "DELETE",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.message ?? payload?.error ?? "No se pudo desvincular el usuario");
      }

      toast.pushToast({
        title: "Usuario desvinculado",
        description: "La cuenta global se conserva y solo se quito el acceso a la academia.",
        variant: "success",
      });
      router.refresh();
    } catch (error) {
      toast.pushToast({
        title: "No se pudo desvincular",
        description: error instanceof Error ? error.message : "Error inesperado.",
        variant: "error",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Button type="button" size="sm" variant="outline" onClick={handleClick} disabled={isSubmitting}>
      {isSubmitting ? (
        <Loader2 className="mr-1 h-4 w-4 animate-spin" />
      ) : (
        <Unlink className="mr-1 h-4 w-4" />
      )}
      {label}
    </Button>
  );
}
