"use client";

import { Share2 } from "lucide-react";
import { useState } from "react";

interface ShareButtonProps {
  eventId: string;
  eventTitle: string;
}

export function ShareButton({ eventId, eventTitle }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);

  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/events/${eventId}` : "";

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: eventTitle,
          text: `Mira este evento: ${eventTitle}`,
          url: shareUrl,
        });
      } catch (error) {
        // Usuario canceló o hubo error
        console.error("Error sharing:", error);
      }
    } else {
      // Fallback: copiar al portapapeles
      try {
        await navigator.clipboard.writeText(shareUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (error) {
        console.error("Error copying to clipboard:", error);
      }
    }
  };

  return (
    <button
      onClick={handleShare}
      className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-all hover:bg-muted hover:border-zaltyko-primary/50"
    >
      <Share2 className="h-4 w-4" />
      {copied ? "¡Copiado!" : "Compartir"}
    </button>
  );
}

