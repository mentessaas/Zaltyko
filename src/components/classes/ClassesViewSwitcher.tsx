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
    <div className="inline-flex items-center rounded-xl border border-zaltyko-mist bg-white p-1 shadow-soft">
      <button
        type="button"
        onClick={() => handleViewChange("table")}
        className={`min-h-9 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
          view === "table"
            ? "bg-zaltyko-teal text-white shadow-soft"
            : "text-zaltyko-text-secondary hover:bg-zaltyko-warm-white hover:text-zaltyko-navy"
        }`}
      >
        Tabla
      </button>
      <button
        type="button"
        onClick={() => handleViewChange("calendar")}
        className={`min-h-9 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
          view === "calendar"
            ? "bg-zaltyko-teal text-white shadow-soft"
            : "text-zaltyko-text-secondary hover:bg-zaltyko-warm-white hover:text-zaltyko-navy"
        }`}
      >
        Calendario
      </button>
    </div>
  );
}
