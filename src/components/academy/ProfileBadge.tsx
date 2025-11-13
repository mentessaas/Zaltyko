"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Menu } from "lucide-react";

import { getRoleLabel } from "@/lib/roles";

interface ProfileBadgeProps {
  name?: string | null;
  role?: string | null;
  membershipRole?: string | null;
  loading?: boolean;
  onSignOut?: () => Promise<void> | void;
  onGoToProfile?: () => void;
  onManageAcademies?: () => void;
  academiesLimitLabel?: string | null;
  canCreateAcademies?: boolean;
  currentAcademyId?: string;
  academies?: { id: string; name: string | null }[];
  onSelectAcademy?: (academyId: string) => void;
}

export function ProfileBadge({
  name,
  role,
  membershipRole,
  loading = false,
  onSignOut,
  onGoToProfile,
  onManageAcademies,
  academiesLimitLabel,
  canCreateAcademies = true,
  currentAcademyId,
  academies = [],
  onSelectAcademy,
}: ProfileBadgeProps) {
  const [open, setOpen] = useState(false);
  const [showLimitMessage, setShowLimitMessage] = useState(false);

  const displayRole = useMemo(
    () => getRoleLabel(membershipRole ?? role),
    [membershipRole, role]
  );

  const handleSignOut = async () => {
    if (onSignOut) {
      await onSignOut();
    }
    setOpen(false);
  };

  const handleGoToProfile = () => {
    if (onGoToProfile) {
      onGoToProfile();
    }
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Menú de usuario"
        className="inline-flex items-center justify-center rounded-lg border border-border bg-background p-2.5 text-muted-foreground shadow-sm transition hover:bg-muted hover:text-foreground"
      >
        <Menu className="h-5 w-5" strokeWidth={1.8} />
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-60 rounded-lg border border-border bg-popover p-3 text-sm shadow-lg">
          <div className="space-y-1 border-b border-border pb-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
              {name?.slice(0, 1)?.toUpperCase() ?? "U"}
            </span>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Usuario</p>
            <p className="font-semibold text-foreground">{name ?? "Sin nombre"}</p>
            <p className="text-xs text-muted-foreground">Rol: {displayRole}</p>
          </div>
          <div className="space-y-2 pt-3">
            <button
              type="button"
              onClick={handleGoToProfile}
              className="flex w-full items-center justify-between rounded-md border border-border px-3 py-2 text-xs font-semibold text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              Ver perfil
            </button>
            {academies.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Academias activas</p>
                <ul className="max-h-40 space-y-1 overflow-auto">
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
                              ? "bg-primary/10 text-primary"
                              : "text-muted-foreground hover:bg-muted hover:text-foreground"
                          }`}
                        >
                          <span className="truncate">{academy.name ?? "Sin nombre"}</span>
                          {isCurrent && <span className="text-[10px] uppercase">Actual</span>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
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
              className="flex w-full items-center justify-between rounded-md border border-dashed border-primary/40 bg-primary/5 px-3 py-2 text-xs font-semibold text-primary transition hover:bg-primary/10 disabled:cursor-not-allowed disabled:border-muted disabled:bg-muted/40 disabled:text-muted-foreground"
            >
              Crear nueva academia
            </button>
            {academiesLimitLabel && showLimitMessage && (
              <p className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                {academiesLimitLabel}
              </p>
            )}
            <button
              type="button"
              onClick={handleSignOut}
              disabled={loading}
              className="flex w-full items-center justify-center rounded-md bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive transition hover:bg-destructive/20 disabled:opacity-60"
            >
              {loading ? "Cerrando sesión…" : "Cerrar sesión"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

