import { describe, expect, it } from "vitest";

import { evaluateLimit } from "@/lib/limits";

describe("Límites por plan", () => {
  it("bloquea al pasar de 50 atletas en plan Free", () => {
    const evaluation = evaluateLimit("free", 50, 50, "athletes");
    expect(evaluation.exceeded).toBe(true);
    expect(evaluation.upgradeTo).toBe("pro");
  });

  it("permite hasta 200 atletas en plan Pro", () => {
    const evaluation = evaluateLimit("pro", 200, 199, "athletes");
    expect(evaluation.exceeded).toBe(false);
  });

  it("no aplica tope en Premium", () => {
    const evaluation = evaluateLimit("premium", null, 1000, "athletes");
    expect(evaluation.exceeded).toBe(false);
  });
});
