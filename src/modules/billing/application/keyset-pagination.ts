type KeysetPageOptions<T> = {
  pageSize: number;
  fetchPage: (after: string | null, limit: number) => PromiseLike<readonly T[]>;
  cursorOf: (row: T) => string;
};

/** Reads every row in deterministic keyset pages without silently truncating. */
export async function readAllKeysetPages<T>(
  options: KeysetPageOptions<T>
): Promise<T[]> {
  if (!Number.isSafeInteger(options.pageSize) || options.pageSize < 1) {
    throw new RangeError("pageSize debe ser un entero positivo");
  }

  const result: T[] = [];
  let cursor: string | null = null;
  while (true) {
    const page = await options.fetchPage(cursor, options.pageSize);
    if (page.length > options.pageSize) {
      throw new RangeError("La página excede el tamaño solicitado");
    }
    if (page.length === 0) return result;

    let lastCursor: string | null = cursor;
    for (const row of page) {
      const nextCursor = options.cursorOf(row);
      if (
        lastCursor !== null &&
        compareStringCursors(nextCursor, lastCursor) <= 0
      ) {
        throw new RangeError("El cursor de paginación no avanza en orden");
      }
      result.push(row);
      lastCursor = nextCursor;
    }

    cursor = lastCursor;
    if (page.length < options.pageSize) return result;
  }
}

export function compareStringCursors(left: string, right: string): number {
  return left.localeCompare(right);
}
