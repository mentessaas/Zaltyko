import { describe, expect, it } from "vitest";

import { parseOwnerSetupReceipt } from "@/components/owner-dashboard/owner-setup-response";

const validReceipt = {
  organizationId: "10000000-0000-4000-8000-000000000001",
  locationId: "20000000-0000-4000-8000-000000000002",
  memberId: "30000000-0000-4000-8000-000000000003",
};

describe("recibo de alta Owner", () => {
  it("acepta el recibo completo de organization, sede y miembro", () => {
    expect(parseOwnerSetupReceipt(validReceipt)).toEqual(validReceipt);
  });

  it.each([
    null,
    [],
    {},
    { ...validReceipt, organizationId: "no-es-un-uuid" },
    { ...validReceipt, locationId: null },
    { ...validReceipt, memberId: 42 },
  ])("rechaza recibos incompletos o malformados", (value) => {
    expect(parseOwnerSetupReceipt(value)).toBeNull();
  });
});
