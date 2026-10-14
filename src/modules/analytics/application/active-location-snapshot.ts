import { and, asc, eq, gt, sql } from "drizzle-orm";

import { db } from "@/db";
import { locations } from "@/db/zaltyko-schema";

const DEFAULT_PAGE_SIZE = 200;
const activeLocationSnapshotBrand: unique symbol = Symbol(
  "active-location-snapshot"
);
const issuedSnapshots = new WeakSet<object>();

export type ActiveLocationSnapshot = Readonly<{
  organizationId: string;
  locationIds: readonly string[];
  [activeLocationSnapshotBrand]: true;
}>;

export async function loadActiveLocationSnapshot(
  organizationId: string,
  pageSize = DEFAULT_PAGE_SIZE
): Promise<ActiveLocationSnapshot> {
  if (!Number.isSafeInteger(pageSize) || pageSize < 1) {
    throw new Error("Active location page size must be a positive integer");
  }

  const locationIds = await db.transaction(async (tx) => {
    // This must be the first statement so every keyset page shares one snapshot.
    await tx.execute(
      sql.raw("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY")
    );

    const ids: string[] = [];
    let cursor: string | undefined;

    while (true) {
      const predicates = [
        eq(locations.organizationId, organizationId),
        eq(locations.isActive, true),
      ];
      if (cursor) predicates.push(gt(locations.id, cursor));

      const page = await tx
        .select({ id: locations.id })
        .from(locations)
        .where(and(...predicates))
        .orderBy(asc(locations.id))
        .limit(pageSize);

      if (page.length === 0) break;

      ids.push(...page.map(({ id }) => id));
      cursor = page[page.length - 1].id;
    }

    return ids;
  });

  const snapshot = Object.freeze({
    organizationId,
    locationIds: Object.freeze(locationIds.slice()),
    [activeLocationSnapshotBrand]: true as const,
  });
  issuedSnapshots.add(snapshot);
  return snapshot;
}

export function getSnapshotLocationIds(
  snapshot: ActiveLocationSnapshot,
  organizationId: string
): readonly string[] {
  if (
    !issuedSnapshots.has(snapshot) ||
    snapshot.organizationId !== organizationId
  ) {
    throw new Error("Active location snapshot does not match organization");
  }

  return snapshot.locationIds;
}
