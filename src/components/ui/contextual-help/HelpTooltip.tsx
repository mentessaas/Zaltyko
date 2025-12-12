"use client";

import { Info, HelpCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface HelpTooltipProps {
  content: string;
  variant?: "info" | "help";
  side?: "top" | "right" | "bottom" | "left";
  className?: string;
}

export function HelpTooltip({ content, variant = "info", side = "top", className }: HelpTooltipProps) {
  const Icon = variant === "info" ? Info : HelpCircle;

  return (
    <TooltipProvider>
      <Tooltip>
        <div className="relative inline-flex">
          <TooltipTrigger asChild>
            <button
              type="button"
              className={`inline-flex items-center text-muted-foreground transition hover:text-foreground ${className}`}
              aria-label="Ayuda"
            >
              <Icon className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side={side} className="max-w-xs text-sm">
            <p>{content}</p>
          </TooltipContent>
        </div>
      </Tooltip>
    </TooltipProvider>
  );
}

