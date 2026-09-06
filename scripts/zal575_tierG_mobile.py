#!/usr/bin/env python3
"""
ZAL-575 Tier G — Contraste WCAG AA en la superficie MOBILE (React Native).

Cierra la limitación #3 declarada en ZAL-575-tierF-components-spec-2026-08-29.md
§7 ("No audita el interno de mobile ... requeriría un Tier G") y el paso 7 del
plan de corrección §6.

CORRECCIÓN DE PREMISA: el Tier F asumió que `mobile/` tenía su propio
`tailwind.config.mjs`. NO lo tiene. Mobile es Expo / React Native puro: usa
`StyleSheet.create` con tokens hex de `mobile/lib/theme.ts` y literales hex
sueltos. Por eso el motor de Tier A-F (que resuelve clases Tailwind) no aplica
aquí y este tier tiene un parser propio.

Estratos (de mayor a menor confianza, sin extrapolación):

  G1  Pares de tokens del sistema  — función pura de `lib/theme.ts`.
  G2  Mismo objeto de estilo       — un objeto declara `color` y
                                     `backgroundColor` a la vez. Cero ambigüedad.
  G3  Superficie única del archivo — el archivo pinta exactamente UN
                                     backgroundColor; todo texto se lee sobre él.
  G4  Props cruzadas de navegación — tabBar*TintColor vs tabBarStyle.background,
                                     headerTintColor vs headerStyle.background,
                                     placeholderTextColor vs el bg del input.
  G5  Literales hex fuera de token — texto con hex crudo (bypass del sistema).

Umbrales WCAG 2.1 AA: 4.5:1 texto normal, 3.0:1 texto grande (>=18.66px bold
o >=24px), 3.0:1 componentes de UI / bordes de foco.

Reproducibilidad: `python3 zal575_tierG_mobile.py` (solo stdlib).
"""

import json
import os
import re
import sys
from collections import defaultdict

REPO = "/Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko"
MOBILE = os.path.join(REPO, "mobile")
THEME = os.path.join(MOBILE, "lib", "theme.ts")
SURFACES = ["app", "components"]

# ---------------------------------------------------------------- color math

def srgb_to_lin(c):
    c = c / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def luminance(rgb):
    r, g, b = (srgb_to_lin(v) for v in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def ratio(fg, bg):
    l1, l2 = luminance(fg), luminance(bg)
    if l1 < l2:
        l1, l2 = l2, l1
    return (l1 + 0.05) / (l2 + 0.05)


def parse_hex(s):
    s = s.strip().lstrip("#")
    if len(s) == 3:
        s = "".join(ch * 2 for ch in s)
    if len(s) == 8:  # #RRGGBBAA
        s = s[:6]
    if len(s) != 6 or not re.fullmatch(r"[0-9a-fA-F]{6}", s):
        return None
    return tuple(int(s[i:i + 2], 16) for i in (0, 2, 4))


RGBA_RE = re.compile(r"rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)")


def parse_color(raw, over=None):
    """Devuelve rgb compuesto sobre `over` si el color tiene alfa. None si no resoluble."""
    raw = raw.strip().strip("'\"")
    if raw.startswith("#"):
        return parse_hex(raw)
    m = RGBA_RE.fullmatch(raw)
    if m:
        r, g, b = int(m.group(1)), int(m.group(2)), int(m.group(3))
        a = float(m.group(4)) if m.group(4) is not None else 1.0
        if a >= 0.999:
            return (r, g, b)
        if over is None:
            return None  # alfa sin fondo conocido: no adivinamos
        return tuple(round(a * c + (1 - a) * o) for c, o in zip((r, g, b), over))
    return None


# ---------------------------------------------------------------- tokens

TOKEN_RE = re.compile(r"^\s*(\w+)\s*:\s*('[^']*'|\"[^\"]*\")\s*,", re.M)


def load_tokens():
    src = open(THEME, encoding="utf-8").read()
    block = re.search(r"export const colors\s*=\s*\{(.*?)\n\}\s*as const;", src, re.S)
    if not block:
        print("ERROR: no se pudo leer `export const colors` de", THEME)
        sys.exit(1)
    out = {}
    for name, val in TOKEN_RE.findall(block.group(1)):
        out[name] = val.strip("'\"")
    return out


# ---------------------------------------------------------------- resolución

def resolve(expr, tokens, over=None):
    """`colors.textMuted` | `'#94A3B8'` | `'rgba(...)'` -> rgb. None si dinámico."""
    expr = expr.strip().rstrip(",").strip()
    m = re.fullmatch(r"colors\.(\w+)", expr)
    if m:
        raw = tokens.get(m.group(1))
        return parse_color(raw, over) if raw else None
    return parse_color(expr, over)


def label(expr, tokens):
    expr = expr.strip().rstrip(",").strip()
    m = re.fullmatch(r"colors\.(\w+)", expr)
    if m:
        return f"colors.{m.group(1)} ({tokens.get(m.group(1), '?')})"
    return expr.strip("'\"")


# ---------------------------------------------------------------- parsing

DECL_RE = re.compile(
    r"\b(color|backgroundColor|borderColor|placeholderTextColor|"
    r"tabBarActiveTintColor|tabBarInactiveTintColor|headerTintColor|"
    r"borderTopColor|tintColor)\s*[:=]\s*\{?\s*"
    r"(colors\.\w+|'[^']*'|\"[^\"]*\")",
)

LARGE_HINT = re.compile(r"typography\.(display|title)|fontSize:\s*(2[0-9]|[3-9][0-9])")


def iter_files():
    for surf in SURFACES:
        root = os.path.join(MOBILE, surf)
        for dirpath, dirnames, filenames in os.walk(root):
            dirnames[:] = [d for d in dirnames if d != "node_modules"]
            for fn in sorted(filenames):
                if not fn.endswith((".tsx", ".ts")):
                    continue
                if ".test." in fn or fn.endswith(".d.ts"):
                    continue
                yield os.path.relpath(os.path.join(dirpath, fn), MOBILE)


def split_objects(src, leaf_only=True):
    """Trocea el fuente en objetos literales `{...}` balanceados.

    `leaf_only=True` devuelve SOLO objetos hoja (sin `{` anidado). Esto es
    crítico para G2: sin ello, el objeto externo de `StyleSheet.create({...})`
    cruzaría el `color` de una clave con el `backgroundColor` de OTRA clave
    distinta, que nunca se pintan juntas — falso positivo masivo.

    Devuelve (línea_inicio, texto) por objeto.
    """
    out, stack = [], []
    for i, ch in enumerate(src):
        if ch == "{":
            stack.append(i)
        elif ch == "}" and stack:
            start = stack.pop()
            body = src[start:i + 1]
            if leaf_only and "{" in body[1:-1]:
                continue
            if len(body) < 4000:
                out.append((src.count("\n", 0, start) + 1, body))
    return out


# ---------------------------------------------------------------- auditoría

def audit():
    tokens = load_tokens()
    tok_by_hex = {}
    for k, v in tokens.items():
        rgb = parse_color(v)
        if rgb:
            tok_by_hex.setdefault(rgb, []).append(k)

    findings = {"G1": [], "G2": [], "G3": [], "G4": [], "G5": []}
    stats = defaultdict(int)
    observed = set()  # (fg_expr, bg_expr) realmente co-pintados en el código

    # ---- G1: pares de tokens del sistema (función pura de theme.ts)
    text_toks = ["text", "textMuted", "textInverse", "primary", "primaryHover",
                 "success", "warning", "danger", "info", "tabActive", "tabInactive"]
    bg_toks = ["bg", "surface", "surfaceMuted", "surfaceDark", "primary",
               "primarySoft", "borderDark"]
    for t in text_toks:
        for b in bg_toks:
            if t == b:
                continue
            bg = parse_color(tokens[b], over=parse_color(tokens["surface"]))
            fg = parse_color(tokens[t], over=bg)
            if not fg or not bg:
                continue
            r = round(ratio(fg, bg), 2)
            findings["G1"].append(dict(fg=t, bg=b, fg_hex=tokens[t],
                                       bg_hex=tokens[b], ratio=r,
                                       pass_normal=r >= 4.5, pass_large=r >= 3.0,
                                       pass_ui=r >= 3.0))

    files = list(iter_files())
    stats["files"] = len(files)

    for rel in files:
        path = os.path.join(MOBILE, rel)
        src = open(path, encoding="utf-8").read()
        lines = src.splitlines()

        # ---- G2: mismo objeto declara color + backgroundColor
        for lineno, body in split_objects(src):
            decls = DECL_RE.findall(body)
            if not decls:
                continue
            bgs = [v for k, v in decls if k in ("backgroundColor",)]
            fgs = [v for k, v in decls if k == "color"]
            if not bgs or not fgs:
                continue
            for bexpr in bgs:
                bg = resolve(bexpr, tokens, over=parse_color(tokens["surface"]))
                if not bg:
                    continue
                for fexpr in fgs:
                    fg = resolve(fexpr, tokens, over=bg)
                    if not fg:
                        continue
                    stats["G2_pairs"] += 1
                    observed.add((fexpr.strip(), bexpr.strip()))
                    r = round(ratio(fg, bg), 2)
                    large = bool(LARGE_HINT.search(body))
                    need = 3.0 if large else 4.5
                    if r < need:
                        findings["G2"].append(dict(
                            file=rel, line=lineno, ratio=r, need=need,
                            fg=label(fexpr, tokens), bg=label(bexpr, tokens),
                            large=large, snippet=" ".join(body.split())[:150]))

        # ---- G3: superficie única del archivo
        all_decls = DECL_RE.findall(src)
        bg_exprs = {v for k, v in all_decls
                    if k in ("backgroundColor",) and "transparent" not in v}
        bg_rgbs = {}
        for e in bg_exprs:
            c = resolve(e, tokens, over=parse_color(tokens["surface"]))
            if c:
                bg_rgbs[e] = c
        unique_bg = len(set(bg_rgbs.values())) == 1
        if unique_bg:
            stats["G3_files_single_surface"] += 1
            bexpr, bg = next(iter(bg_rgbs.items()))
            seen = set()
            for m in DECL_RE.finditer(src):
                if m.group(1) != "color":
                    continue
                fexpr = m.group(2)
                fg = resolve(fexpr, tokens, over=bg)
                if not fg:
                    continue
                lineno = src.count("\n", 0, m.start()) + 1
                ctx = "\n".join(lines[max(0, lineno - 3):lineno + 2])
                large = bool(LARGE_HINT.search(ctx))
                need = 3.0 if large else 4.5
                r = round(ratio(fg, bg), 2)
                observed.add((fexpr.strip(), bexpr.strip()))
                key = (fexpr, bexpr, large)
                if r < need and key not in seen:
                    seen.add(key)
                    findings["G3"].append(dict(
                        file=rel, line=lineno, ratio=r, need=need,
                        fg=label(fexpr, tokens), bg=label(bexpr, tokens),
                        large=large,
                        snippet=lines[lineno - 1].strip()[:140]))
        elif bg_rgbs:
            stats["G3_files_mixed_surface"] += 1

        # ---- G4: props cruzadas de navegación / input
        # Aquí SÍ hace falta el objeto no-hoja: `tabBarInactiveTintColor` vive
        # en `screenOptions` y el fondo en `tabBarStyle: { backgroundColor }`.
        for lineno, body in split_objects(src, leaf_only=False):
            if not re.search(r"tabBar|headerStyle|headerTint", body):
                continue
            decls = dict()
            for k, v in DECL_RE.findall(body):
                decls.setdefault(k, []).append(v)
            pairs = [
                ("tabBarActiveTintColor", "backgroundColor", "tab activo"),
                ("tabBarInactiveTintColor", "backgroundColor", "tab inactivo"),
                ("headerTintColor", "backgroundColor", "título de header"),
            ]
            for fk, bk, what in pairs:
                if fk not in decls or bk not in decls:
                    continue
                for fexpr in decls[fk]:
                    for bexpr in decls[bk]:
                        bg = resolve(bexpr, tokens, over=parse_color(tokens["surface"]))
                        fg = resolve(fexpr, tokens, over=bg)
                        if not fg or not bg:
                            continue
                        observed.add((fexpr.strip(), bexpr.strip()))
                        r = round(ratio(fg, bg), 2)
                        if r < 4.5:
                            findings["G4"].append(dict(
                                file=rel, line=lineno, what=what, ratio=r, need=4.5,
                                fg=label(fexpr, tokens), bg=label(bexpr, tokens)))

        # placeholderTextColor: se lee sobre el bg del input del mismo archivo
        for m in re.finditer(r"placeholderTextColor\s*=\s*\{?\s*(colors\.\w+|'[^']*')", src):
            fexpr = m.group(1)
            for bexpr, bg in bg_rgbs.items():
                fg = resolve(fexpr, tokens, over=bg)
                if not fg:
                    continue
                r = round(ratio(fg, bg), 2)
                if r < 4.5:
                    findings["G4"].append(dict(
                        file=rel, line=src.count("\n", 0, m.start()) + 1,
                        what="placeholder de input", ratio=r, need=4.5,
                        fg=label(fexpr, tokens), bg=label(bexpr, tokens)))

        # ---- G5: literales hex de texto fuera del sistema de tokens
        for m in re.finditer(r"\bcolor\s*[:=]\s*\{?\s*'(#[0-9a-fA-F]{3,8})'", src):
            hexv = m.group(1)
            rgb = parse_hex(hexv)
            if not rgb:
                continue
            stats["G5_literals"] += 1
            findings["G5"].append(dict(
                file=rel, line=src.count("\n", 0, m.start()) + 1, hex=hexv,
                is_token=hexv.upper() in {v.upper() for v in tokens.values()},
                token_name=",".join(tok_by_hex.get(rgb, [])) or None))

    # dedup G2/G3 por (archivo, fg, bg)
    for k in ("G2", "G3"):
        seen, out = set(), []
        for v in findings[k]:
            key = (v["file"], v["fg"], v["bg"], v["large"])
            if key in seen:
                continue
            seen.add(key)
            out.append(v)
        findings[k] = sorted(out, key=lambda x: x["ratio"])
    findings["G4"] = sorted(findings["G4"], key=lambda x: x["ratio"])

    # Marcar en G1 qué pares de tokens están REALMENTE co-pintados en el código.
    obs_tok = set()
    for fexpr, bexpr in observed:
        mf = re.fullmatch(r"colors\.(\w+)", fexpr)
        mb = re.fullmatch(r"colors\.(\w+)", bexpr)
        if mf and mb:
            obs_tok.add((mf.group(1), mb.group(1)))
    for v in findings["G1"]:
        v["observed"] = (v["fg"], v["bg"]) in obs_tok
    findings["G1"] = sorted(findings["G1"], key=lambda x: x["ratio"])
    stats["G1_observed_pairs"] = len(obs_tok)

    return tokens, findings, dict(stats)


# ---------------------------------------------------------------- salida

def main():
    tokens, f, stats = audit()

    print("=" * 78)
    print("ZAL-575 Tier G — contraste WCAG AA en mobile (React Native / Expo)")
    print("=" * 78)
    print(f"REPO      : {REPO}")
    print(f"superficie: mobile/{{{', '.join(SURFACES)}}}")
    print(f"tokens    : mobile/lib/theme.ts ({len(tokens)} colores)")
    print(f"archivos  : {stats.get('files')}")
    print()

    print(">>> G1  Pares de tokens del sistema (función pura de theme.ts)")
    used = [v for v in f["G1"] if v["observed"]]
    bad = [v for v in f["G1"] if not v["pass_normal"]]
    bad_used = [v for v in used if not v["pass_normal"]]
    print(f"    combinaciones posibles  : {len(f['G1'])}")
    print(f"    co-pintadas en el código: {len(used)}   <-- las accionables")
    print(f"    de esas, < 4.5:1        : {len(bad_used)}")
    print(f"    de esas, < 3.0:1        : {len([v for v in used if not v['pass_large']])}")
    print(f"    (matriz completa < 4.5:1: {len(bad)} — el resto son combinaciones\n"
          f"     teóricas que ningún archivo pinta; se guardan en el JSON, no se accionan)")
    print()
    print("    -- SOLO pares co-pintados --")
    for v in used:
        flag = "FAIL-AA " if not v["pass_normal"] else "ok      "
        flag2 = "FAIL-UI" if not v["pass_ui"] else "       "
        print(f"    {v['ratio']:>6.2f}:1  {flag}{flag2}  "
              f"{v['fg']:<12} {v['fg_hex']:<9} sobre  {v['bg']:<12} {v['bg_hex']}")

    for tier, title in (
        ("G2", "Mismo objeto de estilo declara color + backgroundColor"),
        ("G3", "Archivo con superficie única (todo el texto sobre un solo fondo)"),
        ("G4", "Props cruzadas de navegación / placeholder"),
    ):
        print()
        print(f">>> {tier}  {title}")
        print(f"    violaciones: {len(f[tier])}")
        for v in f[tier]:
            extra = f"  [{v['what']}]" if "what" in v else (
                "  (texto grande)" if v.get("large") else "")
            print(f"\n    {v['ratio']:>5.2f}:1 < {v['need']}{extra}")
            print(f"        {v['fg']}")
            print(f"        sobre {v['bg']}")
            print(f"        {v['file']}:{v['line']}")
            if v.get("snippet"):
                print(f"        …{v['snippet']}")

    print()
    print(">>> G5  Literales hex de texto fuera del sistema de tokens")
    off = [v for v in f["G5"] if not v["is_token"]]
    dup = [v for v in f["G5"] if v["is_token"]]
    print(f"    literales de color de texto : {len(f['G5'])}")
    print(f"      duplican un token         : {len(dup)}")
    print(f"      fuera del sistema         : {len(off)}")
    byhex = defaultdict(list)
    for v in f["G5"]:
        byhex[v["hex"].upper()].append(v)
    for hexv, vs in sorted(byhex.items(), key=lambda kv: -len(kv[1])):
        tn = vs[0]["token_name"]
        mark = f"== colors.{tn}" if tn else "-- fuera del sistema"
        print(f"    {hexv}  x{len(vs):<3} {mark}")
        for v in vs[:4]:
            print(f"          {v['file']}:{v['line']}")
        if len(vs) > 4:
            print(f"          … +{len(vs) - 4} más")

    print()
    print(">>> stats")
    for k, v in sorted(stats.items()):
        print(f"    {k:<28}: {v}")

    out = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                       "zal575_tierG_results.json")
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(dict(repo=REPO, surface="mobile", tokens=tokens,
                       findings=f, stats=stats), fh, ensure_ascii=False, indent=2)
    print(f"\njson -> {out}")


if __name__ == "__main__":
    main()
