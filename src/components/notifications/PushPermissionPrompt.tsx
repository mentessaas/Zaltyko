"use client";

import { useEffect, useState } from "react";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Bell, BellOff, Check, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface PushPermissionPromptProps {
  className?: string;
  onSubscribed?: () => void;
  onUnsubscribed?: () => void;
  variant?: "card" | "banner" | "inline";
  showIcon?: boolean;
}

export function PushPermissionPrompt({
  className,
  onSubscribed,
  onUnsubscribed,
  variant = "card",
  showIcon = true,
}: PushPermissionPromptProps) {
  const {
    isSupported,
    permission,
    subscription,
    isLoading,
    error,
    subscribe,
    unsubscribe,
  } = usePushNotifications();

  const [hasInteracted, setHasInteracted] = useState(false);

  useEffect(() => {
    if (subscription) {
      onSubscribed?.();
    } else if (hasInteracted && permission === "denied") {
      onUnsubscribed?.();
    }
  }, [subscription, permission, hasInteracted, onSubscribed, onUnsubscribed]);

  if (!isSupported) {
    return null;
  }

  const handleSubscribe = async () => {
    setHasInteracted(true);
    await subscribe();
  };

  const handleUnsubscribe = async () => {
    await unsubscribe();
  };

  // Don't show if already interacted and denied (unless they want to try again)
  if (permission === "denied" && !hasInteracted) {
    return null;
  }

  const content = (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        {showIcon && (
          <div
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-full",
              permission === "granted"
                ? "bg-green-100 dark:bg-green-900"
                : "bg-slate-100 dark:bg-slate-800"
            )}
          >
            {permission === "granted" ? (
              <Bell className="h-5 w-5 text-green-600 dark:text-green-400" />
            ) : (
              <BellOff className="h-5 w-5 text-slate-500" />
            )}
          </div>
        )}
        <div>
          <p className="font-medium">
            {permission === "granted"
              ? "Notificaciones activas"
              : "Recibe alertas en tiempo real"}
          </p>
          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>
      </div>

      {permission === "granted" ? (
        <Button
          variant="outline"
          size="sm"
          onClick={handleUnsubscribe}
          disabled={isLoading}
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <BellOff className="h-4 w-4 mr-2" />
              Desactivar
            </>
          )}
        </Button>
      ) : (
        <Button size="sm" onClick={handleSubscribe} disabled={isLoading}>
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Bell className="h-4 w-4 mr-2" />
              Activar
            </>
          )}
        </Button>
      )}
    </div>
  );

  if (variant === "card") {
    return (
      <Card className={className}>
        <CardContent className="pt-6">{content}</CardContent>
      </Card>
    );
  }

  if (variant === "banner") {
    return (
      <div
        className={cn(
          "flex items-center justify-between gap-4 rounded-lg border bg-card p-4",
          className
        )}
      >
        {content}
      </div>
    );
  }

  return <div className={className}>{content}</div>;
}

// Compact badge version for showing status
export function PushPermissionBadge({ className }: { className?: string }) {
  const { isSupported, permission, subscription } = usePushNotifications();

  if (!isSupported || permission === "denied") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-xs",
          "text-slate-600 dark:bg-slate-800 dark:text-slate-400",
          className
        )}
      >
        <BellOff className="h-3 w-3" />
        Off
      </span>
    );
  }

  if (subscription) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-1 text-xs",
          "text-green-700 dark:bg-green-900 dark:text-green-300",
          className
        )}
      >
        <Check className="h-3 w-3" />
        Push On
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-xs",
        "text-amber-700 dark:bg-amber-900 dark:text-amber-300",
        className
      )}
    >
      <Bell className="h-3 w-3" />
      Push Off
    </span>
  );
}
