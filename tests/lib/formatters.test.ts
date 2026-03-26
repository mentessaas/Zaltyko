import { describe, it, expect } from "vitest";
import { formatAcademyType } from "@/lib/formatters";

describe("formatAcademyType", () => {
  it("should format artistica correctly", () => {
    expect(formatAcademyType("artistica")).toBe("Gimnasia artística");
  });

  it("should format ritmica correctly", () => {
    expect(formatAcademyType("ritmica")).toBe("Gimnasia rítmica");
  });

  it("should format trampolin correctly", () => {
    expect(formatAcademyType("trampolin")).toBe("Trampolín");
  });

  it("should format general correctly", () => {
    expect(formatAcademyType("general")).toBe("General / Mixta");
  });

  it("should return default for unknown types", () => {
    expect(formatAcademyType("unknown")).toBe("Disciplina no definida");
    expect(formatAcademyType("")).toBe("Disciplina no definida");
    expect(formatAcademyType(null)).toBe("Disciplina no definida");
    expect(formatAcademyType(undefined)).toBe("Disciplina no definida");
  });
});
