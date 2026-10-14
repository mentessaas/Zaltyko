import { describe, expect, it, vi } from "vitest";

import { readAllKeysetPages } from "@/modules/billing/application/keyset-pagination";

describe("billing keyset pagination", () => {
  it("returns every row across pages in stable cursor order", async () => {
    const rows = Array.from({ length: 7 }, (_, index) => ({
      id: `row-${String(index + 1).padStart(2, "0")}`,
      amountCents: (index + 1) * 100,
    }));
    const cursors: Array<string | null> = [];
    const fetchPage = vi.fn(async (after: string | null, limit: number) => {
      cursors.push(after);
      return rows
        .filter((row) => after === null || row.id > after)
        .slice(0, limit);
    });

    const result = await readAllKeysetPages<{
      id: string;
      amountCents: number;
    }>({
      pageSize: 3,
      fetchPage,
      cursorOf: (row) => row.id,
    });

    expect(result).toEqual(rows);
    expect(result.reduce((total, row) => total + row.amountCents, 0)).toBe(
      2800
    );
    expect(cursors).toEqual([null, "row-03", "row-06"]);
  });

  it("rejects a page that repeats or reverses the cursor", async () => {
    await expect(
      readAllKeysetPages<{ id: string }>({
        pageSize: 2,
        fetchPage: async () => [{ id: "b" }, { id: "a" }],
        cursorOf: (row) => row.id,
      })
    ).rejects.toThrow("El cursor de paginación no avanza en orden");
  });

  it("keeps composite cursors stable across page boundaries", async () => {
    const rows = [
      { lineId: "line-a", enrollmentId: "enrollment-a", className: "Base" },
      { lineId: "line-a", enrollmentId: "enrollment-b", className: "Barra" },
      { lineId: "line-b", enrollmentId: "enrollment-a", className: "Suelo" },
    ];
    const result = await readAllKeysetPages<{
      lineId: string;
      enrollmentId: string;
      className: string;
    }>({
      pageSize: 2,
      fetchPage: async (after, limit) =>
        rows
          .filter((row) => {
            const key = `${row.lineId}:${row.enrollmentId}`;
            return after === null || key > after;
          })
          .slice(0, limit),
      cursorOf: (row) => `${row.lineId}:${row.enrollmentId}`,
    });

    expect(result).toEqual(rows);
    expect(result.map((row) => row.className)).toEqual([
      "Base",
      "Barra",
      "Suelo",
    ]);
  });
});
