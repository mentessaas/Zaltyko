import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("event file upload tenant contract", () => {
  it("does not confuse an event id with an academy tenant id", () => {
    const source = readFileSync("src/components/events/FileUpload.tsx", "utf8");
    const route = readFileSync("src/app/api/events/upload/route.ts", "utf8");
    expect(source).toContain('formData.append("eventId", eventId)');
    expect(source).not.toContain('"x-academy-id": eventId');
    expect(route).toContain('z.string().uuid().safeParse(eventId)');
    expect(route).toContain('eq(events.tenantId, context.tenantId)');
  });
});
