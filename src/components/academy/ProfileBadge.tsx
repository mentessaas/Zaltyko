"use client";

import { useState } from "react";
import { Building2, Plus } from "lucide-react";

interface ProfileBadgeProps {
  currentAcademyId?: string;
  academies?: { id: string; name: string | null }[];
  onSelectAcademy?: (academyId: string) => void;
  onManageAcademies?: () => void;
  academiesLimitLabel?: string | null;
  canCreateAcademies?: boolean;
}

export function ProfileBadge({
  currentAcademyId,
  academies = [],
  onSelectAcademy,
  onManageAcademies,
  academiesLimitLabel,
  canCreateAcademies = true,
}: ProfileBadgeProps) {
  const [open, setOpen] = useState(false);
  const [showLimitMessage, setShowLimitMessage] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Cambiar de academia"
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-muted-foreground shadow-sm transition hover:bg-muted hover:text-foreground"
      >
        <Building2 className="h-3.5 w-3.5" strokeWidth={1.8} />
        <span className="hidden sm:inline">Academias</span>
      </button>

      {open && (
        <>
          {/* Overlay para cerrar al hacer click fuera */}
          <div
            className="fixed inset-0 z-20"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute right-0 z-30 mt-2 w-64 rounded-lg border border-border bg-popover p-3 text-sm shadow-lg">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Cambiar de academia
              </p>
              {academies.length > 0 ? (
                <ul className="max-h-48 space-y-1 overflow-auto">
                  {academies.map((academy) => {
                    const isCurrent = academy.id === currentAcademyId;
                    return (
                      <li key={academy.id}>
                        <button
                          type="button"
                          onClick={() => {
                            if (onSelectAcademy) {
                              onSelectAcademy(academy.id);
                            }
                            setOpen(false);
                          }}
                          className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-xs transition ${
                            isCurrent
                              ? "bg-primary/10 text-primary font-medium"
                              : "text-muted-foreground hover:bg-muted hover:text-foreground"
                          }`}
                        >
                          <span className="truncate">{academy.name ?? "Sin nombre"}</span>
                          {isCurrent && (
                            <span className="ml-2 shrink-0 text-[10px] font-semibold uppercase">
                              Actual
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="px-3 py-2 text-xs text-muted-foreground">
                  No hay academias disponibles
                </p>
              )}
              <div className="border-t border-border pt-2">
                <button
                  type="button"
                  onClick={() => {
                    if (!canCreateAcademies) {
                      setShowLimitMessage(true);
                      return;
                    }
                    if (onManageAcademies) {
                      onManageAcademies();
                    }
                    setOpen(false);
                  }}
                  disabled={!canCreateAcademies}
                  className="flex w-full items-center gap-2 rounded-md border border-dashed border-primary/40 bg-primary/5 px-3 py-2 text-xs font-semibold text-primary transition hover:bg-primary/10 disabled:cursor-not-allowed disabled:border-muted disabled:bg-muted/40 disabled:text-muted-foreground"
                >
                  <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                  Crear nueva academia
                </button>
                {academiesLimitLabel && showLimitMessage && (
                  <p className="mt-2 rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                    {academiesLimitLabel}
                  </p>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

