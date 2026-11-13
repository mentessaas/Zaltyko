"use client";

import Link from "next/link";
import type { GroupsBundle } from "./owner-groups-manager-model";
import { ownerUi } from "./owner-ui";

/** "Grupos de la academia" navigation. Links are inert while a command is unresolved. */
export function OwnerGroupsSidebar({
  groups,
  selectedGroupId,
  commandsLocked,
  groupHref,
}: {
  groups: GroupsBundle["groups"];
  selectedGroupId: string | undefined;
  commandsLocked: boolean;
  groupHref: (groupId?: string, nextLocationId?: string) => string;
}) {
  return (
    <nav
      aria-label="Grupos de la academia"
      className={`${ownerUi.card} sm:p-5`}
    >
      <h2 className="floor-label mb-3 text-z-soft">Grupos de la academia</h2>
      {groups.length === 0 ? (
        <p className="text-sm leading-6 text-z-soft">
          Todavía no hay grupos. Crea uno y asígnalo a una actividad y a
          una sede.
        </p>
      ) : (
        <ul className="space-y-1">
          {groups.map((group) => (
            <li key={group.id}>
              <Link
                href={groupHref(group.id, group.locationId)}
                aria-disabled={commandsLocked}
                tabIndex={commandsLocked ? -1 : undefined}
                onClick={(event) => {
                  if (commandsLocked) event.preventDefault();
                }}
                aria-current={
                  group.id === selectedGroupId ? "page" : undefined
                }
                className={`touch-target flex min-h-14 items-center justify-between gap-3 rounded-md px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-z-brand-500 ${group.id === selectedGroupId ? "bg-z-brand-50 text-z-brand-700" : "hover:bg-z-canvas"}`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">
                    {group.name}
                  </span>
                  <span className="block truncate text-xs text-z-soft">
                    {group.programName ?? "Actividad sin clasificar"} ·{" "}
                    {group.locationName}
                  </span>
                </span>
                <span className="shrink-0 text-xs tabular-nums text-z-soft">
                  {group.memberCount}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </nav>
  );
}
