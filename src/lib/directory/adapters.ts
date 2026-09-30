import { createHash } from "node:crypto";
export type OfficialSource = {
  url: string;
  name: string;
  country_code: string;
  adapter: string;
};
export function plainHtml(value: string) {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n);
      return code <= 0x10ffff ? String.fromCodePoint(code) : "";
    })
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}
const months: Record<string, string> = {
  enero: "01",
  febrero: "02",
  marzo: "03",
  abril: "04",
  mayo: "05",
  junio: "06",
  julio: "07",
  agosto: "08",
  septiembre: "09",
  octubre: "10",
  noviembre: "11",
  diciembre: "12",
  jan: "01",
  feb: "02",
  mar: "03",
  apr: "04",
  may: "05",
  jun: "06",
  jul: "07",
  aug: "08",
  sep: "09",
  oct: "10",
  nov: "11",
  dec: "12",
};
export function officialCandidates(html: string, source: OfficialSource) {
  const candidates: unknown[] = [];
  const resources: { url: string; title: string }[] = [];
  const sourceEvidence = (excerpt: string) => ({
    excerpt: plainHtml(excerpt).slice(0, 500),
    pageHash: createHash("sha256").update(html).digest("hex"),
  });
  if (source.adapter === "rfeg")
    for (const match of html.matchAll(
      /<button\b[^>]*class="competition--trigger"[^>]*data-modal-id="(\d+)"[^>]*>([\s\S]*?)<\/button>/g
    )) {
      const body = match[2],
        name = plainHtml(body.match(/<h3\b[^>]*>([\s\S]*?)<\/h3>/)?.[1] ?? "");
      if (!name) continue;
      const date = plainHtml(
        body.match(/<span class="date">([\s\S]*?)<\/span>/)?.[1] ?? ""
      )
        .toLowerCase()
        .match(/^(\d{1,2})(?:[–-](\d{1,2}))?\s+(\w+)\s+(20\d{2})$/);
      const month = date ? months[date[3]] : null;
      const location = plainHtml(
        body.match(/<span class="location">([\s\S]*?)<\/span>/)?.[1] ?? ""
      );
      candidates.push({
        externalId: `rfeg:${match[1]}`,
        kind: "event",
        evidence: sourceEvidence(body),
        data: {
          name,
          countryCode: source.country_code,
          city:
            location && !/definir|confirmar/i.test(location) ? location : null,
          startDate:
            date && month
              ? `${date[4]}-${month}-${date[1].padStart(2, "0")}`
              : null,
          endDate:
            date?.[2] && month
              ? `${date[4]}-${month}-${date[2].padStart(2, "0")}`
              : null,
          organizerName: "Real Federación Española de Gimnasia",
          sourceUrl: source.url,
          sourceName: source.name,
          eventStatus: "provisional",
        },
      });
    }
  if (source.adapter === "fdpg")
    for (const body of html.split(/<div class="event-item">/).slice(1)) {
      const name = plainHtml(
        body.match(/<h3 class="event-title">([\s\S]*?)<\/h3>/)?.[1] ?? ""
      );
      if (!name) continue;
      const year = name.match(/\b(20\d{2})\b/)?.[1],
        day = plainHtml(
          body.match(/<span class="ed-day">([^<]+)<\/span>/)?.[1] ?? ""
        ),
        month =
          months[
            plainHtml(
              body.match(/<span class="ed-month">([^<]+)<\/span>/)?.[1] ?? ""
            ).toLowerCase()
          ];
      const link = body.match(
        /href="(https:\/\/www\.federaciongimnasia\.com\/entradas\/evento\/\d+)"/
      )?.[1];
      const venue = plainHtml(
        body.match(
          /<span><i class="fas fa-map-marker-alt"><\/i>([\s\S]*?)<\/span>/
        )?.[1] ?? ""
      );
      candidates.push({
        externalId:
          link ??
          createHash("sha256")
            .update(name + "|" + day + "|" + month)
            .digest("hex"),
        kind: "event",
        evidence: sourceEvidence(body.split("<!-- Botón")[0]),
        data: {
          name,
          countryCode: source.country_code,
          city: null,
          venue: venue || null,
          startDate:
            year && day && month
              ? `${year}-${month}-${day.padStart(2, "0")}`
              : null,
          organizerName: "Federación Deportiva Peruana de Gimnasia",
          sourceUrl: source.url,
          sourceName: source.name,
          eventStatus: /FINALIZADO/.test(
            body.split("</h3>")[1]?.slice(0, 500) ?? ""
          )
            ? "finished"
            : "provisional",
        },
      });
    }
  // A calendar publication date is not the date of a competition. Preserve PDF references for extraction and review.
  for (const match of html.matchAll(
    /<a\b[^>]*href="([^"]+\.pdf)"[^>]*>([\s\S]*?)<\/a>/gi
  )) {
    try {
      const url = new URL(match[1]);
      if (
        url.protocol === "https:" &&
        [
          "rfegimnasia.es",
          "www.federaciongimnasia.com",
          "federaciongimnasia.com",
          "sge.cbginastica.com.br",
        ].includes(url.hostname) &&
        !resources.some((r) => r.url === url.href)
      )
        resources.push({
          url: url.href,
          title: plainHtml(match[2]).slice(0, 200),
        });
    } catch {
      /* Untrusted malformed source link. */
    }
  }
  return { candidates, resources };
}
