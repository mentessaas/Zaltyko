import { describe, expect, it } from "vitest";

import { getLimitForRoute } from "@/lib/rate-limit";

describe("límite de solicitudes para familias Owner", () => {
  it("usa el límite autenticado de escrituras Owner para archivo y reactivación", () => {
    expect(
      getLimitForRoute(
        "/api/v1/owner/families/80000000-0000-4000-8000-000000000004/lifecycle"
      )
    ).toEqual({ limit: 30, window: 60 });
  });
});
