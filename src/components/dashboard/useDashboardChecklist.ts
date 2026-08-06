"use client";

import { useEffect, useState } from "react";
import { logger } from "@/lib/logger";

interface ChecklistProgress {
  completed: number;
  total: number;
}

interface ChecklistItem {
  key: string;
  label: string;
  description: string | null;
  status: "pending" | "completed" | "skipped";
}

export function useDashboardChecklist(academyId: string) {
  const [progress, setProgress] = useState<ChecklistProgress | null>(null);
  const [items, setItems] = useState<ChecklistItem[]>([]);

  useEffect(() => {
    const fetchChecklist = async () => {
      try {
        const response = await fetch(`/api/onboarding/checklist?academyId=${academyId}`, {
          cache: "no-store",
        });
        if (response.ok) {
          const json = await response.json();
          if (json.summary) {
            setProgress(json.summary);
          }
          if (json.items) {
            setItems(json.items);
          }
        }
      } catch (error) {
        logger.error("Error fetching checklist:", error);
      }
    };

    fetchChecklist();
  }, [academyId]);

  return { progress, items };
}
