"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface EventCountdownProps {
  targetDate: string | Date;
  showLabels?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

function calculateTimeLeft(targetDate: string | Date): TimeLeft | null {
  const difference = new Date(targetDate).getTime() - new Date().getTime();

  if (difference <= 0) {
    return null;
  }

  return {
    days: Math.floor(difference / (1000 * 60 * 60 * 24)),
    hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((difference / 1000 / 60) % 60),
    seconds: Math.floor((difference / 1000) % 60),
  };
}

function TimeBlock({ value, label, size }: { value: number; label: string; size: "sm" | "md" | "lg" }) {
  const sizeClasses = {
    sm: "text-xs px-1.5 py-0.5",
    md: "text-sm px-2 py-1",
    lg: "text-base px-3 py-2",
  };

  return (
    <div className="flex flex-col items-center">
      <div
        className={cn(
          "bg-zaltyko-primary text-white font-bold rounded-md min-w-[2.5rem] text-center",
          sizeClasses[size]
        )}
      >
        {String(value).padStart(2, "0")}
      </div>
      <span className={cn("text-muted-foreground mt-1", size === "sm" ? "text-[10px]" : size === "md" ? "text-xs" : "text-sm")}>
        {label}
      </span>
    </div>
  );
}

export function EventCountdown({ targetDate, showLabels = true, size = "md", className }: EventCountdownProps) {
  const [timeLeft, setTimeLeft] = useState<TimeLeft | null>(() => calculateTimeLeft(targetDate));

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(calculateTimeLeft(targetDate));
    }, 1000);

    return () => clearInterval(timer);
  }, [targetDate]);

  if (!timeLeft) {
    return (
      <div className={cn("text-center", className)}>
        <span className="text-sm font-medium text-zaltyko-primary">El evento ha comenzado</span>
      </div>
    );
  }

  const isUrgent = timeLeft.days === 0 && timeLeft.hours < 24;

  return (
    <div
      className={cn(
        "flex gap-2 md:gap-3 items-center justify-center",
        isUrgent && "animate-pulse",
        className
      )}
    >
      <TimeBlock value={timeLeft.days} label={showLabels ? "días" : ""} size={size} />
      <span className="text-muted-foreground font-medium">:</span>
      <TimeBlock value={timeLeft.hours} label={showLabels ? "h" : ""} size={size} />
      <span className="text-muted-foreground font-medium">:</span>
      <TimeBlock value={timeLeft.minutes} label={showLabels ? "m" : ""} size={size} />
      {size !== "sm" && (
        <>
          <span className="text-muted-foreground font-medium">:</span>
          <TimeBlock value={timeLeft.seconds} label={showLabels ? "s" : ""} size={size} />
        </>
      )}
    </div>
  );
}

interface RegistrationCountdownProps {
  startDate?: string | Date | null;
  endDate?: string | Date | null;
  className?: string;
}

export function RegistrationCountdown({ startDate, endDate, className }: RegistrationCountdownProps) {
  const now = new Date();
  const start = startDate ? new Date(startDate) : null;
  const end = endDate ? new Date(endDate) : null;

  const hasStarted = !start || start <= now;
  const hasEnded = !end || end <= now;

  if (hasEnded) {
    return (
      <div className={cn("text-center text-sm", className)}>
        <span className="text-muted-foreground">Inscripciones cerradas</span>
      </div>
    );
  }

  if (!hasStarted && start) {
    return (
      <div className={cn("text-center", className)}>
        <p className="text-sm text-muted-foreground mb-2">Las inscripciones abren en:</p>
        <EventCountdown targetDate={start} size="sm" />
      </div>
    );
  }

  if (end) {
    return (
      <div className={cn("text-center", className)}>
        <p className="text-sm text-muted-foreground mb-2">Las inscripciones cierran en:</p>
        <EventCountdown targetDate={end} size="sm" />
      </div>
    );
  }

  return null;
}
