import { describe, expect, it } from "vitest";
import { officialCandidates } from "@/lib/directory/adapters";
import { publicIPv4 } from "@/lib/directory/source-fetch";
import { EntryInputSchema } from "@/lib/directory/contracts";

describe("Fuentes oficiales: evidencia y campos desconocidos", () => {
  it("conserva el rango de días de RFEG sin inventar horas", () => {
    const result = officialCandidates(
      '<button class="competition--trigger" data-modal-id="42"><h3>Campeonato ficticio</h3><span class="date">12–15 octubre 2026</span><span class="location">Madrid</span></button>',
      {
        url: "https://rfegimnasia.es/competiciones-nacionales/",
        name: "RFEG",
        country_code: "ES",
        adapter: "rfeg",
      }
    );
    const candidate = result.candidates[0] as {
      data: unknown;
      evidence: { pageHash: string };
    };
    const parsed = EntryInputSchema.parse({
      kind: "event",
      data: candidate.data,
    });
    expect(parsed.data.startDate).toBe("2026-10-12");
    expect(parsed.data.endDate).toBe("2026-10-15");
    expect(parsed.data.startTime).toBeUndefined();
    expect(parsed.data.eventStatus).toBe("provisional");
    expect(candidate.evidence.pageHash).toMatch(/^[a-f0-9]{64}$/);
  });
  it("no interpreta la fecha de publicación de un PDF como fecha del evento", () => {
    const result = officialCandidates(
      '<tr><td>30/09/2026</td><td><a href="https://sge.cbginastica.com.br/docs/calendario.pdf">Calendário 2026</a></td></tr>',
      {
        url: "https://cbginastica.com.br/calendarios/126/calendarios",
        name: "CBG",
        country_code: "BR",
        adapter: "cbg",
      }
    );
    expect(result.candidates).toEqual([]);
    expect(result.resources).toHaveLength(1);
  });
  it("no inventa la ciudad peruana ni convierte entradas en inscripción deportiva", () => {
    const result = officialCandidates(
      '<div class="event-item"><h3 class="event-title">Campeonato ficticio 2026</h3><span class="ed-day">12</span><span class="ed-month">Sep</span><span><i class="fas fa-map-marker-alt"></i>Recinto ficticio</span><a href="https://www.federaciongimnasia.com/entradas/evento/1">Entradas</a>',
      {
        url: "https://www.federaciongimnasia.com/calendario",
        name: "FDPG",
        country_code: "PE",
        adapter: "fdpg",
      }
    );
    const data = (result.candidates[0] as { data: Record<string, unknown> })
      .data;
    expect(data.city).toBeNull();
    expect(data.registrationUrl).toBeUndefined();
    expect(data.startDate).toBe("2026-09-12");
  });
  it.each([
    "127.0.0.1",
    "10.0.0.1",
    "169.254.169.254",
    "192.168.1.1",
    "172.16.0.1",
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "::1",
    "::ffff:127.0.0.1",
  ])("impide extraer desde la dirección privada %s", (address) => {
    expect(publicIPv4(address)).toBe(false);
  });
  it("acepta una dirección IPv4 pública", () =>
    expect(publicIPv4("8.8.8.8")).toBe(true));
});
