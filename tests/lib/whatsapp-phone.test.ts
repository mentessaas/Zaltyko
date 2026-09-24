import { describe, expect, it } from "vitest";
import { formatPhoneForWhatsApp } from "@/lib/whatsapp";

describe("WhatsApp phone formatting", () => {
  it("uses the academy country for local numbers", () => {
    expect(formatPhoneForWhatsApp("55 11 99999-0000", "AR")).toBe("545511999990000");
    expect(formatPhoneForWhatsApp("600 123 456", "ES")).toBe("34600123456");
  });

  it("preserves numbers already in international format", () => {
    expect(formatPhoneForWhatsApp("+52 55 1234 5678", "MX")).toBe("525512345678");
    expect(formatPhoneForWhatsApp("0057 300 123 4567", "CO")).toBe("573001234567");
  });

  it("accepts legacy country names as well as ISO codes", () => {
    expect(formatPhoneForWhatsApp("55 1234 5678", "México")).toBe("525512345678");
  });
});
