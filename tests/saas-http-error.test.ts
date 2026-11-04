import { describe, expect, it } from "vitest";

import { saasHttpErrorCode } from "@/modules/saas-billing/application/http-error";
import { OperationalError } from "@/modules/shared/domain/operational-error";

describe("SaaS commercial market errors", () => {
  it("exposes the country-specific market denial code", () => {
    const error = new OperationalError(
      "FORBIDDEN",
      "La contratación SaaS no está habilitada para el país de esta academia",
      403,
      { code: "SAAS_MARKET_NOT_ENABLED" }
    );

    expect(saasHttpErrorCode(error)).toBe("SAAS_MARKET_NOT_ENABLED");
  });
});
