import { describe, expect, it } from "vitest";

import {
  buildEventFormDefaults,
  buildEventPayload,
  getEventInitialDataFromSummary,
} from "@/components/events/event-form-model";

describe("event-form-model", () => {
  it("normaliza resumen legacy de evento a initialData editable", () => {
    expect(
      getEventInitialDataFromSummary({
        title: "Copa Primavera",
        date: "2026-04-12",
        location: "Madrid, Comunidad de Madrid, España",
        status: "published",
      })
    ).toMatchObject({
      title: "Copa Primavera",
      startDate: "2026-04-12",
      city: "Madrid",
      province: "Comunidad de Madrid",
      country: "España",
      isPublic: true,
    });
  });

  it("crea defaults completos desde initialData parcial", () => {
    const defaults = buildEventFormDefaults({
      title: "Control interno",
      category: ["Base", "Promesas"],
      contactEmail: "",
    });

    expect(defaults.title).toBe("Control interno");
    expect(defaults.category).toBe("Base, Promesas");
    expect(defaults.contactEmail).toBe("");
    expect(defaults.status).toBe("draft");
  });

  it("construye payload API conservando compatibilidad con campos legacy", () => {
    const payload = buildEventPayload("academy-1", {
      ...buildEventFormDefaults(),
      title: "Torneo",
      category: "Base, Elite",
      level: "local",
      eventType: "competition",
      countryName: "España",
      provinceName: "Madrid",
      cityName: "Madrid",
      startDate: "2026-05-01",
      images: ["https://example.com/image.png"],
      attachments: [{ name: "", url: "https://example.com/file.pdf" }],
      isPublic: true,
    });

    expect(payload).toMatchObject({
      academyId: "academy-1",
      title: "Torneo",
      category: ["Base", "Elite"],
      level: "local",
      eventType: "competition",
      country: "España",
      province: "Madrid",
      city: "Madrid",
      images: ["https://example.com/image.png"],
      attachments: [{ name: "Archivo 1", url: "https://example.com/file.pdf" }],
      isPublic: true,
    });
  });
});
