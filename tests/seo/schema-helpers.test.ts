import { describe, expect, it } from "vitest";
import { academyJsonLd } from "@/lib/seo/academy-schema";
import { coachJsonLd } from "@/lib/seo/coach-schema";
import { eventJsonLd } from "@/lib/seo/event-schema";
import { jobPostingJsonLd } from "@/lib/seo/job-schema";

const BASE_URL = "https://zaltyko.com";

describe("eventJsonLd", () => {
  it("devuelve null sin startDate", () => {
    const out = eventJsonLd({
      baseUrl: BASE_URL,
      pagePath: "/events/abc",
      title: "Trofeo",
      startDate: null,
    });
    expect(out).toBeNull();
  });

  it("devuelve null sin title", () => {
    const out = eventJsonLd({
      baseUrl: BASE_URL,
      pagePath: "/events/abc",
      title: "",
      startDate: "2026-12-01",
    });
    expect(out).toBeNull();
  });

  it("emite Event con location agregada cuando hay ciudad y país", () => {
    const out = eventJsonLd({
      baseUrl: BASE_URL,
      pagePath: "/events/abc",
      title: "Trofeo Invierno",
      description: "Competición regional",
      startDate: "2026-12-01T10:00:00Z",
      endDate: "2026-12-03T18:00:00Z",
      cityName: "Madrid",
      countryName: "España",
      organizerName: "Club X",
      organizerUrl: `${BASE_URL}/academias/xyz`,
    });
    expect(out).not.toBeNull();
    expect(out!["@type"]).toBe("Event");
    expect(out!.startDate).toBe("2026-12-01T10:00:00.000Z");
    const loc = out!.location as Record<string, unknown>;
    expect(loc.addressLocality).toBe("Madrid");
    expect(loc.addressCountry).toBe("España");
    const org = out!.organizer as Record<string, unknown>;
    expect(org.name).toBe("Club X");
  });

  it("marca SoldOut cuando validThrough es pasado", () => {
    const out = eventJsonLd({
      baseUrl: BASE_URL,
      pagePath: "/events/abc",
      title: "Trofeo",
      startDate: "2026-12-01",
      registrationEndDate: "2020-01-01",
      cityName: "Madrid",
      countryName: "España",
    });
    const offers = out!.offers as Record<string, unknown>;
    expect(offers.availability).toBe("https://schema.org/SoldOut");
  });

  it("incluye precio si hay registrationFeeCents > 0", () => {
    const out = eventJsonLd({
      baseUrl: BASE_URL,
      pagePath: "/events/abc",
      title: "Trofeo",
      startDate: "2026-12-01",
      registrationEndDate: "2030-01-01",
      registrationFeeCents: 2500,
      currency: "EUR",
      cityName: "Madrid",
      countryName: "España",
    });
    const offers = out!.offers as Record<string, unknown>;
    expect(offers.price).toBe("25.00");
    expect(offers.priceCurrency).toBe("EUR");
  });
});

describe("academyJsonLd", () => {
  it("devuelve null sin nombre", () => {
    expect(
      academyJsonLd({
        baseUrl: BASE_URL,
        pagePath: "/academias/x",
        id: "x",
        name: "",
        city: "Madrid",
        country: "España",
      }),
    ).toBeNull();
  });

  it("devuelve null sin ubicación mínima", () => {
    expect(
      academyJsonLd({
        baseUrl: BASE_URL,
        pagePath: "/academias/x",
        id: "x",
        name: "Academia X",
      }),
    ).toBeNull();
  });

  it("emite SportsActivityLocation con address y logo como ImageObject", () => {
    const out = academyJsonLd({
      baseUrl: BASE_URL,
      pagePath: "/academias/abc",
      id: "abc",
      name: "Club Test",
      description: "Academia de prueba",
      city: "Madrid",
      region: "Madrid",
      country: "España",
      logoUrl: "https://cdn.example.com/logo.png",
      website: "https://example.com",
      schedule: {
        1: [{ name: "Sala A", startTime: "16:00:00", endTime: "20:00:00" }],
      },
    });
    expect(out).not.toBeNull();
    expect(out!["@type"]).toBe("SportsActivityLocation");
    const logo = out!.logo as string;
    expect(logo).toBe("https://cdn.example.com/logo.png");
    const image = out!.image as Record<string, unknown>;
    expect(image["@type"]).toBe("ImageObject");
    expect(out!.openingHours).toEqual(["Monday 16:00-20:00"]);
    expect(out!.sameAs).toContain("https://example.com");
  });
});

describe("jobPostingJsonLd", () => {
  it("devuelve null sin title o description", () => {
    expect(
      jobPostingJsonLd({
        baseUrl: BASE_URL,
        pagePath: "/empleo/1",
        id: "1",
        title: "",
        description: "x",
        datePosted: "2026-09-01",
        hiringOrganization: { name: "Club" },
        jobLocation: { city: "Madrid", country: "ES" },
      }),
    ).toBeNull();
  });

  it("emite JobPosting completo con employmentType normalizado", () => {
    const out = jobPostingJsonLd({
      baseUrl: BASE_URL,
      pagePath: "/empleo/1",
      id: "1",
      title: "Entrenador de gimnasia",
      description: "Buscamos entrenador con experiencia",
      datePosted: "2026-09-01",
      validThrough: "2026-12-31",
      employmentType: "part_time",
      jobLocation: { city: "Madrid", province: "Madrid", country: "ES" },
      hiringOrganization: { name: "Club A" },
      salary: { min: 1200, max: 1500, currency: "EUR" },
    });
    expect(out).not.toBeNull();
    expect(out!["@type"]).toBe("JobPosting");
    expect(out!.employmentType).toBe("PART_TIME");
    const baseSalary = out!.baseSalary as Record<string, unknown>;
    expect(baseSalary.currency).toBe("EUR");
    const value = baseSalary.value as Record<string, unknown>;
    expect(value.minValue).toBe(1200);
    expect(value.maxValue).toBe(1500);
  });
});

describe("coachJsonLd", () => {
  it("devuelve null sin nombre", () => {
    expect(
      coachJsonLd({
        baseUrl: BASE_URL,
        pagePath: "/coaches/abc",
        name: "",
      }),
    ).toBeNull();
  });

  it("incluye knowsAbout y worksFor con url", () => {
    const out = coachJsonLd({
      baseUrl: BASE_URL,
      pagePath: "/coaches/abc",
      name: "Ana Pérez",
      description: "Entrenadora de artística",
      imageUrl: "https://cdn.example.com/ana.jpg",
      worksFor: { name: "Club Test", url: `${BASE_URL}/academias/x` },
      knowsAbout: ["Salto", "Suelo"],
      sameAs: ["https://instagram.com/anaperez"],
    });
    expect(out).not.toBeNull();
    expect(out!["@type"]).toBe("Person");
    expect(out!.knowsAbout).toEqual(["Salto", "Suelo"]);
    expect(out!.sameAs).toEqual(["https://instagram.com/anaperez"]);
    const worksFor = out!.worksFor as Record<string, unknown>;
    expect(worksFor.name).toBe("Club Test");
    expect(worksFor.url).toBe(`${BASE_URL}/academias/x`);
  });
});
