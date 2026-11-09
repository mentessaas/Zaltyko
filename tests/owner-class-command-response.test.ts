import { describe, expect, it } from "vitest";
import { readOwnerClassCreateReceipt } from "@/components/owner-dashboard/owner-class-command-response";

const id = "40000000-0000-4000-8000-000000000001";
const receipt = {
  ok: true,
  data: {
    id,
    name: "Artística iniciación",
    sessionCount: 18,
    generatedThrough: "2027-02-19",
  },
};

describe("acuse de creación de clase recurrente", () => {
  it("acepta un acuse completo que coincide con el nombre del comando", () => {
    expect(readOwnerClassCreateReceipt(receipt, "Artística iniciación")).toEqual(receipt.data);
  });

  it("no confirma un recibo de otra clase con un UUID válido", () => {
    expect(
      readOwnerClassCreateReceipt(
        { ...receipt, data: { ...receipt.data, name: "Rítmica" } },
        "Artística iniciación"
      )
    ).toBeNull();
  });

  it.each([
    { ...receipt, data: { ...receipt.data, id: "not-a-uuid" } },
    { ...receipt, data: { ...receipt.data, sessionCount: -1 } },
    { ...receipt, data: { ...receipt.data, sessionCount: 1.5 } },
    { ...receipt, data: { ...receipt.data, generatedThrough: "2027-02-30" } },
    { data: receipt.data },
  ])("conserva la incertidumbre ante un acuse incompleto o inválido (%#)", (payload) => {
    expect(readOwnerClassCreateReceipt(payload, "Artística iniciación")).toBeNull();
  });
});
