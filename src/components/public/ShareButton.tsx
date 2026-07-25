"use client";
import { Button } from "@/components/ui/button";

import { Share2 } from "lucide-react";
import { useState } from "react";
import { logger } from "@/lib/logger";

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
        logger.error("Error sharing:", error);
      }
    } else {
      // Fallback: copiar al portapapeles
      try {
        await navigator.clipboard.writeText(shareUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (error) {
        logger.error("Error copying to clipboard:", error);
      }
    }
  };

  return (
    <Button type="button" variant="outline" size="sm" onClick={handleShare}>
      <Share2 className="h-4 w-4" />
      {copied ? "¡Copiado!" : "Compartir"}
    </Button>
  );
}

