"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { MessagesSquare, Megaphone, Bell } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Centro de comunicacion interno unificado.
 *
 * Reemplaza la navegacion separada a /messages, /announcements y
 * /notifications por un hub con 3 tabs. Cada tab carga su contenido
 * via lazy load para mantener bundle inicial pequeno.
 *
 * Estado: P3 del backlog (consolidar comunicacion interna como
 * historial unificado por gimnasta/familia/grupo).
 */

type CommsTab = "messages" | "announcements" | "notifications";

const tabs: Array<{ id: CommsTab; label: string; icon: typeof MessagesSquare }> = [
  { id: "messages", label: "Mensajes", icon: MessagesSquare },
  { id: "announcements", label: "Anuncios", icon: Megaphone },
  { id: "notifications", label: "Notificaciones", icon: Bell },
];

const MessagesPanel = dynamic(
  () => import("./panels/MessagesPanel").then((m) => ({ default: m.MessagesPanel })),
  { ssr: false }
);

const AnnouncementsPanel = dynamic(
  () => import("./panels/AnnouncementsPanel").then((m) => ({ default: m.AnnouncementsPanel })),
  { ssr: false }
);

const NotificationsPanel = dynamic(
  () => import("./panels/NotificationsPanel").then((m) => ({ default: m.NotificationsPanel })),
  { ssr: false }
);

export function CommunicationHub({ academyId }: { academyId: string }) {
  const [active, setActive] = useState<CommsTab>("messages");

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="border-b">
        <nav
          className="flex gap-1"
          role="tablist"
          aria-label="Centro de comunicacion"
        >
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = active === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={`tab-panel-${tab.id}`}
                id={`tab-${tab.id}`}
                onClick={() => setActive(tab.id)}
                className={cn(
                  "flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors min-h-[44px]",
                  isActive
                    ? "border-zaltyko-accent text-zaltyko-accent"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-zaltyko-border"
                )}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab panels */}
      <div
        role="tabpanel"
        id={`tab-panel-${active}`}
        aria-labelledby={`tab-${active}`}
      >
        {active === "messages" && <MessagesPanel academyId={academyId} />}
        {active === "announcements" && <AnnouncementsPanel academyId={academyId} />}
        {active === "notifications" && <NotificationsPanel academyId={academyId} />}
      </div>
    </div>
  );
}