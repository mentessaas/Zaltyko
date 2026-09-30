"use client";
import { useEffect } from "react";
import { capturePublicGrowthEvent } from "@/lib/growth/client";
export function DirectoryMeasurement({
  id,
  kind,
}: {
  id: string;
  kind: string;
}) {
  useEffect(() => {
    capturePublicGrowthEvent({
      eventName: "directory_viewed",
      source: "directory",
      properties: { entry_id: id, kind, audience: "unknown" },
    });
    const click = (event: MouseEvent) => {
      const anchor = (event.target as Element | null)?.closest(
        "a[data-directory-action]"
      );
      if (!anchor) return;
      const action = anchor.getAttribute("data-directory-action");
      capturePublicGrowthEvent({
        eventName:
          action === "kit"
            ? "directory_kit_downloaded"
            : "directory_organizer_clicked",
        source: "directory",
        properties: { entry_id: id, kind, audience: "unknown" },
      });
    };
    document.addEventListener("click", click);
    return () => document.removeEventListener("click", click);
  }, [id, kind]);
  return null;
}
