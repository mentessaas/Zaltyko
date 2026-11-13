import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// /offline.html se sirve desde la caché del service worker con las cabeceras
// del middleware: la CSP con nonce bloquea scripts y manejadores en línea, así
// que la página funciona sin JavaScript y sin recursos externos.
describe("public/offline.html", () => {
  const html = readFileSync("public/offline.html", "utf8");

  it("no depende de JavaScript: reintentar es un enlace normal", () => {
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/\son[a-z]+=/i);
    expect(html).toMatch(/<a class="retry-btn" href="\/">/);
  });

  it("usa los valores del mundo sin fuentes ni recursos externos", () => {
    expect(html).toContain('<meta name="theme-color" content="#14307F">');
    expect(html).toContain("#1E3FA8");
    expect(html).not.toMatch(/Outfit|#0D47A1|#2196F3|#EF6B6B|linear-gradient/);
    expect(html).not.toMatch(/https?:\/\//);
  });
});
