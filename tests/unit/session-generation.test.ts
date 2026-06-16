import { describe, it, expect } from "vitest";
import { generateClassSessions } from "@/lib/generate-class-sessions";

describe("Session Generation Logic", () => {
    it("debe verificar que la función existe", () => {
        expect(generateClassSessions).toBeDefined();
    });
});
