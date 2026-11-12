// Auditoría heurística de contraste WCAG 2.x (P2 #20). Sin dependencias.
//
// Uso:
//   node scripts/audit-contrast.mjs "src/app/(site)"                 # web pública (fondo claro)
//   node scripts/audit-contrast.mjs --fondo=#0B1430 "src/app/(super-admin)"  # superadmin (noche)
//
// Empareja, dentro de cada className, la clase de texto (text-*) con la de
// fondo (bg-*), resolviendo los tokens de «Magnesio sobre tapiz» de
// tailwind.config.mjs y globals.css. Sin fondo en la misma cadena mide contra
// el fondo por defecto (blanco y magnesio, o el de --fondo). Exige 4,5:1, o
// 3:1 en texto grande. Limitaciones: une las dos ramas de un ternario (falsos
// positivos tipo «text-white sobre bg-white»), no ve fondos de ancestros ni el
// grano/brillo de mat-field, y omite estados (hover:, dark:). Cada hallazgo se
// revisa a mano antes de cambiar nada.
import fs from "node:fs";
import path from "node:path";

const MAT = { 50: "#F0F3FC", 100: "#E8EDFB", 200: "#CED9F6", 300: "#A9BEF0", 400: "#7C99E6", 500: "#4A6BD3", 600: "#2F51BE", 700: "#1E3FA8", 800: "#14307F", 900: "#0F2463", 950: "#0B1430" };
const SIGNAL = { 50: "#FDF3F0", 100: "#FDECE7", 200: "#FAD3C9", 300: "#F5AE9D", 400: "#EE806A", 500: "#E5482A", 600: "#C93C20", 700: "#B8331A", 800: "#962A16", 900: "#7A2414", 950: "#431109" };
const OCHRE = { 50: "#FBF6EA", 100: "#F7ECD2", 200: "#EFD8A6", 300: "#E3BC6E", 400: "#D49F3C", 500: "#C4851A", 600: "#8F600F", 700: "#7A500E", 800: "#5F3F0D", 900: "#4D340E", 950: "#2A1C07" };
const RAMP = { 50: "#F4F6F2", 100: "#E9ECE6", 200: "#D5DAE3", 300: "#B4BCCB", 400: "#8A93A8", 500: "#5C6782", 600: "#3E4A66", 700: "#27314C", 800: "#162038", 900: "#0B1430", 950: "#070D20" };

const C = { white: "#FFFFFF", black: "#000000", tape: "#FFFFFF" };
for (const f of ["teal", "emerald", "green", "cyan", "sky", "blue", "indigo", "violet", "purple", "lime"]) for (const [k, v] of Object.entries(MAT)) C[`${f}-${k}`] = v;
for (const f of ["red", "rose", "pink", "fuchsia", "signal"]) for (const [k, v] of Object.entries(SIGNAL)) C[`${f}-${k}`] = v;
for (const f of ["amber", "yellow", "orange", "ochre"]) for (const [k, v] of Object.entries(OCHRE)) C[`${f}-${k}`] = v;
for (const [k, v] of Object.entries(MAT)) C[`mat-${k}`] = v;
for (const f of ["gray", "slate", "zinc", "neutral", "stone", "ramp"]) for (const [k, v] of Object.entries(RAMP)) C[`${f}-${k}`] = v;
Object.assign(C, {
  mat: "#1E3FA8", "mat-deep": "#14307F", "mat-night": "#0B1430", "mat-lane": "#8FB4FF", "mat-light": "#5B7BE0", "mat-wash": "#E8EDFB",
  chalk: "#F4F6F2", "chalk-dust": "#E9ECE6", "chalk-line": "#D5DAE3",
  signal: "#E5482A", "signal-ink": "#B8331A", "signal-light": "#FF8A73", "signal-wash": "#FDECE7",
  ochre: "#C4851A", "ochre-ink": "#7A500E", "ochre-light": "#F2C46B", "ochre-wash": "#F7ECD2", "ochre-line": "#E3BC6E",
  "zaltyko-navy": "#0B1430", "zaltyko-indigo": "#14307F", "zaltyko-teal": "#1E3FA8", "zaltyko-coral": "#C2391E", "zaltyko-white": "#F4F6F2",
  "zaltyko-warm-white": "#E9ECE6", "zaltyko-mist": "#D5DAE3", "zaltyko-primary": "#1E3FA8", "zaltyko-primary-dark": "#14307F",
  "zaltyko-primary-light": "#5B7BE0", "zaltyko-primary-ultralight": "#E8EDFB", "zaltyko-electric": "#8FB4FF",
  "zaltyko-text-main": "#0B1430", "zaltyko-text-secondary": "#3E4A66", "zaltyko-text-light": "#5C6782", "zaltyko-border": "#D5DAE3",
  "zaltyko-bg": "#F4F6F2", "zaltyko-bg-paper": "#FFFFFF", "zaltyko-bg-dark": "#0B1430",
  "z-canvas": "#F4F6F2", "z-line": "#D5DAE3", "z-ink": "#0B1430", "z-soft": "#5C6782",
  "z-brand-50": "#E8EDFB", "z-brand-100": "#CED9F6", "z-brand-500": "#1E3FA8", "z-brand-600": "#1E3FA8", "z-brand-700": "#14307F",
  "z-chalk-50": "#FDECE7", "z-chalk-500": "#E5482A", "z-chalk-600": "#B8331A",
  background: "#F4F6F2", foreground: "#0B1430", card: "#FFFFFF", "card-foreground": "#0B1430", popover: "#FFFFFF",
  primary: "#1E3FA8", "primary-foreground": "#FFFFFF", secondary: "#14307F", "secondary-foreground": "#FFFFFF",
  muted: "#E9ECE6", "muted-foreground": "#5C6782", accent: "#14307F", "accent-foreground": "#FFFFFF",
  destructive: "#C2391E", "destructive-foreground": "#FFFFFF",
});

const FONDO = process.argv.find((a) => a.startsWith("--fondo="))?.slice(8) ?? null;
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const mix = (fg, bg, a) => fg.map((c, i) => Math.round(c * a + bg[i] * (1 - a)));

function resolve(token) {
  // token sin prefijo text-/bg-, con /opacidad opcional
  const m = token.match(/^(.+?)(?:\/(\d+|\[[\d.]+\]))?$/);
  if (!m) return null;
  const name = m[1];
  const op = m[2] ? (m[2].startsWith("[") ? parseFloat(m[2].slice(1, -1)) : parseInt(m[2], 10) / 100) : 1;
  let h = C[name];
  if (!h && /^\[#[0-9a-fA-F]{6}\]$/.test(name)) h = name.slice(1, -1).toUpperCase();
  if (!h) return null;
  return { name: token, rgb: hex(h), op };
}

const LARGE = /(?:^|\s)(?:[a-z]+:)?text-(?:2xl|3xl|4xl|5xl|6xl|7xl|8xl|9xl|\[clamp)/;
const BOLDISH = /(?:^|\s)font-(?:bold|extrabold|black)\b/;
const XL = /(?:^|\s)text-(?:xl|lg)\b/;

function audit(file) {
  const src = fs.readFileSync(file, "utf8");
  const out = [];
  const re = /className=(?:"([^"]*)"|\{`([^`]*)`\}|\{cn\(([\s\S]*?)\)\})|"((?:[^"\n]*\s)?(?:text|bg)-[^"\n]*)"/g;
  let m;
  while ((m = re.exec(src))) {
    const cls = (m[1] ?? m[2] ?? m[3] ?? m[4] ?? "").replace(/["'`,]/g, " ");
    const toks = cls.split(/\s+/).filter(Boolean);
    const base = toks.filter((t) => !t.includes(":") || /^(sm|md|lg|xl|2xl):/.test(t)).map((t) => t.replace(/^(sm|md|lg|xl|2xl):/, ""));
    const texts = base.filter((t) => t.startsWith("text-")).map((t) => resolve(t.slice(5))).filter(Boolean);
    const bgs = base.filter((t) => t.startsWith("bg-")).map((t) => resolve(t.slice(3))).filter(Boolean);
    if (!texts.length) continue;
    const large = LARGE.test(cls) || (XL.test(cls) && /text-xl/.test(cls) && BOLDISH.test(cls));
    const need = large ? 3 : 4.5;
    const line = src.slice(0, m.index).split("\n").length;
    const DARK = FONDO ? hex(FONDO) : null;
    const bgList = bgs.length ? bgs : DARK ? [{ name: "(fondo noche)", rgb: DARK, op: 1 }] : [{ name: "(blanco)", rgb: hex("#FFFFFF"), op: 1 }, { name: "(magnesio)", rgb: hex("#F4F6F2"), op: 1 }];
    for (const t of texts) {
      // Texto claro sin fondo propio (o con velo translúcido): el fondo oscuro
      // lo pone un ancestro; se revisa a mano, no aquí.
      if (!FONDO && lum(t.rgb) > 0.4 && (!bgs.length || bgs.every((b) => b.op < 1))) continue;
      for (const b of bgList) {
        const under = FONDO ? hex(FONDO) : hex("#FFFFFF");
        const bgRgb = b.op < 1 ? mix(b.rgb, under, b.op) : b.rgb;
        const fg = t.op < 1 ? mix(t.rgb, bgRgb, t.op) : t.rgb;
        const r = ratio(fg, bgRgb);
        if (r < need) out.push({ file, line, text: `text-${t.name}`, bg: b.name.startsWith("(") ? b.name : `bg-${b.name}`, ratio: r.toFixed(2), need, large });
      }
    }
  }
  return out;
}

function walk(p, acc = []) {
  const st = fs.statSync(p);
  if (st.isDirectory()) for (const e of fs.readdirSync(p)) walk(path.join(p, e), acc);
  else if (/\.(tsx|ts|jsx)$/.test(p)) acc.push(p);
  return acc;
}

{
  const files = process.argv.slice(2).filter((a) => !a.startsWith("--")).flatMap((p) => walk(p));
  const rows = files.flatMap(audit);
  const seen = new Set();
  for (const r of rows) {
    const k = `${r.file}:${r.line}:${r.text}:${r.bg}`;
    if (seen.has(k)) continue;
    seen.add(k);
    console.log(`${r.file}:${r.line}\t${r.text} sobre ${r.bg}\t${r.ratio}:1 (mín ${r.need}${r.large ? ", grande" : ""})`);
  }
  console.error(`archivos: ${files.length}, hallazgos: ${seen.size}`);
}
