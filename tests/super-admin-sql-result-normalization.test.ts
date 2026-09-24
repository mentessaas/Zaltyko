import { describe, expect, it } from "vitest";

import { normalizeSqlRows } from "@/lib/superAdminService";

describe("Super Admin SQL result normalization", () => {
  it("acepta arrays directos de adaptadores y mocks", () => {
    expect(normalizeSqlRows<{ value: number }>([{ value: 3 }])).toEqual([{ value: 3 }]);
  });

  it("acepta QueryResult de node-postgres y evita el crash del dashboard", () => {
    expect(normalizeSqlRows<{ value: number }>({ rows: [{ value: 7 }] })).toEqual([{ value: 7 }]);
  });

  it("falla cerrado a array vacío ante una forma inesperada", () => {
    expect(normalizeSqlRows({ rowCount: 1 })).toEqual([]);
  });
});
