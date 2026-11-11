import { readAllKeysetPages } from "@/modules/billing/application/keyset-pagination";

export const READ_PAGE_SIZE = 200;
export const READ_FILTER_BATCH_SIZE = 200;
export const COVERAGE_PAIR_BATCH_SIZE = 100;

/**
 * Reads every keyset page for each batch of filter values, in batch order.
 * Keeps `inArray` filters bounded (READ_FILTER_BATCH_SIZE) and every page at
 * READ_PAGE_SIZE rows.
 */
export async function readKeysetPagesByBatches<T, K>(args: {
  values: readonly K[];
  batchSize: number;
  cursorOf: (row: T) => string;
  fetchPage: (
    values: K[],
    cursor: string | null,
    limit: number
  ) => PromiseLike<readonly T[]>;
}): Promise<T[]> {
  const rows: T[] = [];
  for (let start = 0; start < args.values.length; start += args.batchSize) {
    const batch = args.values.slice(start, start + args.batchSize);
    rows.push(
      ...(await readAllKeysetPages({
        pageSize: READ_PAGE_SIZE,
        cursorOf: args.cursorOf,
        fetchPage: (cursor, limit) => args.fetchPage(batch, cursor, limit),
      }))
    );
  }
  return rows;
}

export function compareNullableStrings(
  left: string | null,
  right: string | null
): number {
  if (left === null) return right === null ? 0 : 1;
  if (right === null) return -1;
  return left.localeCompare(right);
}
