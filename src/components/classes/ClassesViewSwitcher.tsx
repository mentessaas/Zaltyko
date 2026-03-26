"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";

interface ClassesViewSwitcherProps {
  initialView?: "table" | "calendar";
}

export function ClassesViewSwitcher({ initialView = "table" }: ClassesViewSwitcherProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [view, setView] = useState<"table" | "calendar">(initialView);

  useEffect(() => {
    const viewParam = searchParams.get("view");
    if (viewParam === "calendar" || viewParam === "table") {
      setView(viewParam);
    }
  }, [searchParams]);

  const handleViewChange = useCallback((newView: "table" | "calendar") => {
    setView(newView);
    const params = new URLSearchParams(searchParams?.toString());
    params.set("view", newView);
    router.replace(`?${params.toString()}`, { scroll: false });
  }, [router, searchParams]);

  return (
    <div className="inline-flex items-center rounded-lg border border-border bg-background p-1">
      <button
        type="button"
        onClick={() => handleViewChange("table")}
        className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
          view === "table"
            ? "bg-primary text-white shadow"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        }`}
      >
        Tabla
      </button>
      <button
        type="button"
        onClick={() => handleViewChange("calendar")}
        className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
          view === "calendar"
            ? "bg-primary text-white shadow"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        }`}
      >
        Calendario
      </button>
    </div>
  );
}
