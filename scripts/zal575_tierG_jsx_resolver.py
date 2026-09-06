#!/usr/bin/env python3
"""
ZAL-575 Tier G (motor JSX) — resolución de superficie por ANCESTRÍA REAL.

Por qué existe este archivo
---------------------------
El primer pase de Tier G (`zal575_tierG_mobile.py`) resolvía el fondo de un
texto por "superficie única del archivo". Eso produjo un falso positivo grave:

    app/(tabs)/profile.tsx
      styles.flex  -> backgroundColor: colors.bg   (#0F172A, navy)
      styles.value -> color: colors.text           (#0F172A)
      => el heurístico gritó 1.00:1 "texto invisible"

Pero el `<Text style={styles.value}>` vive dentro de `<Card>`, y `Card` pinta
`colors.surface` (#FFFFFF). El contraste real es 17.85:1 — PASA.

Ése es exactamente el caso que el Tier F declaró fuera de alcance en su §7:
"El heurístico no cruza fronteras de componente". Este motor lo cruza.

Cómo
----
1. REGISTRO DE SUPERFICIES. Para cada componente de `components/`, se lee el
   `backgroundColor` del estilo aplicado al elemento raíz que retorna. Eso da
   `Card -> #FFFFFF`, `InfoBanner -> #EFF6FF`, etc.
2. PILA JSX. Se recorre cada archivo tokenizando `<Tag …>`, `</Tag>` y
   `<Tag … />`, manteniendo una pila. Cuando un elemento aporta fondo (por su
   `style={styles.X}` con backgroundColor, por `style={{backgroundColor: …}}`
   inline, o por ser un componente del registro) se apila esa superficie.
3. RESOLUCIÓN. Al encontrar un `<Text style={styles.Y}>` o un `color={…}`, el
   fondo es el tope de la pila. Si la pila está vacía, la superficie raíz del
   archivo. Si no hay ninguna, se marca `unresolved` y NO se reporta.

Sólo se reportan violaciones con fondo resuelto. Sin extrapolación.

Reproducibilidad: `python3 zal575_tierG_jsx_resolver.py` (solo stdlib).
"""

import json
import os
import re
import sys
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

REPO = "/Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko"
MOBILE = os.path.join(REPO, "mobile")
THEME = os.path.join(MOBILE, "lib", "theme.ts")

# reutilizamos la aritmética de color del primer pase
import importlib.util

_spec = importlib.util.spec_from_file_location(
    "tierg_base", os.path.join(HERE, "zal575_tierG_mobile.py"))
_base = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_base)

ratio = _base.ratio
parse_color = _base.parse_color
parse_hex = _base.parse_hex
load_tokens = _base.load_tokens

TOKENS = load_tokens()
WHITE = parse_color(TOKENS["surface"])


def resolve_color(expr, over=None):
    expr = expr.strip().rstrip(",").strip()
    m = re.fullmatch(r"colors\.(\w+)", expr)
    if m:
        raw = TOKENS.get(m.group(1))
        return parse_color(raw, over) if raw else None
    return parse_color(expr, over)


def label(expr):
    expr = expr.strip().rstrip(",").strip()
    m = re.fullmatch(r"colors\.(\w+)", expr)
    if m:
        return f"colors.{m.group(1)} ({TOKENS.get(m.group(1), '?')})"
    return expr.strip("'\"")


# ------------------------------------------------------- StyleSheet parsing

STYLE_KEY_RE = re.compile(r"(\w+)\s*:\s*\{")


def parse_stylesheet(src):
    """styles.<key> -> {'color': expr, 'backgroundColor': expr, 'large': bool}"""
    out = {}
    for m in re.finditer(r"StyleSheet\.create\(\s*\{", src):
        i = src.index("{", m.end() - 1)
        depth, j = 0, i
        while j < len(src):
            if src[j] == "{":
                depth += 1
            elif src[j] == "}":
                depth -= 1
                if depth == 0:
                    break
            j += 1
        body = src[i + 1:j]
        # claves de primer nivel
        k, depth2 = 0, 0
        start = 0
        key = None
        for p, ch in enumerate(body):
            if ch == "{":
                if depth2 == 0:
                    km = re.search(r"(\w+)\s*:\s*$", body[start:p])
                    key = km.group(1) if km else None
                    kstart = p
                depth2 += 1
            elif ch == "}":
                depth2 -= 1
                if depth2 == 0 and key:
                    obj = body[kstart:p + 1]
                    ent = {}
                    cm = re.search(r"\bcolor\s*:\s*(colors\.\w+|'[^']*'|\"[^\"]*\")", obj)
                    bm = re.search(r"\bbackgroundColor\s*:\s*(colors\.\w+|'[^']*'|\"[^\"]*\")", obj)
                    if cm:
                        ent["color"] = cm.group(1)
                    if bm:
                        ent["backgroundColor"] = bm.group(1)
                    ent["large"] = bool(re.search(
                        r"typography\.(display|title)|fontSize:\s*(2[0-9]|[3-9][0-9])", obj))
                    if ent.get("color") or ent.get("backgroundColor"):
                        out[key] = ent
                    start = p + 1
                    key = None
    return out


def iter_files():
    for surf in ("app", "components"):
        root = os.path.join(MOBILE, surf)
        for dp, dn, fns in os.walk(root):
            dn[:] = [d for d in dn if d != "node_modules"]
            for fn in sorted(fns):
                if fn.endswith(".tsx") and ".test." not in fn:
                    yield os.path.relpath(os.path.join(dp, fn), MOBILE)


# --------------------------------------------- registro de superficies

ROOT_STYLE_HINT = ("card", "banner", "container", "wrap", "root", "box",
                   "backdrop", "sheet", "row", "flex", "bubble", "overlay")


def build_surface_registry():
    """ComponentName -> (rgb, etiqueta). Sólo componentes de `components/`."""
    reg = {}
    for rel in iter_files():
        if not rel.startswith("components/"):
            continue
        name = os.path.basename(rel)[:-4]
        src = open(os.path.join(MOBILE, rel), encoding="utf-8").read()
        sheet = parse_stylesheet(src)
        bgs = {k: v["backgroundColor"] for k, v in sheet.items()
               if v.get("backgroundColor") and "transparent" not in v["backgroundColor"]}
        if not bgs:
            continue
        # 1) el estilo aplicado al elemento raíz del return
        rootm = re.search(r"return \(\s*<\w+[^>]*?style=\{\[?\s*styles\.(\w+)", src, re.S)
        pick = rootm.group(1) if rootm and rootm.group(1) in bgs else None
        # 2) si no, el primer estilo cuyo nombre parezca de contenedor
        if not pick:
            for k in bgs:
                if k.lower() in ROOT_STYLE_HINT:
                    pick = k
                    break
        # 3) si no, y hay un único fondo, ése
        if not pick and len(set(bgs.values())) == 1:
            pick = next(iter(bgs))
        if not pick:
            continue
        rgb = resolve_color(bgs[pick], over=WHITE)
        if rgb:
            reg[name] = (rgb, f"{name}.{pick} = {label(bgs[pick])}")
    return reg


# --------------------------------------------- recorrido JSX con pila

TAG_RE = re.compile(r"<(/?)([A-Z][\w.]*|Text|View)((?:[^<>{}]|\{[^{}]*\})*?)(/?)>", re.S)
SELF_CLOSING_HTMLISH = set()

TAG_OPEN_RE = re.compile(r"<(/?)([A-Z][\w.]*|Text|View)(?=[\s/>])")


class Tag:
    """Etiqueta JSX ya tokenizada."""

    __slots__ = ("closing", "name", "attrs", "selfclose", "start", "end")

    def __init__(self, closing, name, attrs, selfclose, start, end):
        self.closing, self.name = closing, name
        self.attrs, self.selfclose = attrs, selfclose
        self.start, self.end = start, end

    def groups(self):
        return (self.closing, self.name, self.attrs, self.selfclose)


def scan_tags(src):
    """Tokeniza `<Tag …>` balanceando llaves, corchetes y comillas.

    `TAG_RE` (regex) no puede casar atributos con llaves anidadas como
    `style={[styles.badge, { backgroundColor: f(x) + '22' }]}`. Cuando falla
    en una apertura pero acierta en el `</View>` correspondiente, la pila de
    ancestría se desincroniza y el resto del archivo se resuelve contra la
    superficie equivocada. Ese bug produjo los falsos positivos de
    `InvoiceCard` (texto dentro de `styles.card` blanco reportado como si
    estuviera sobre el fondo navy de la pantalla).

    Este escáner recorre carácter a carácter respetando anidamiento, así que
    la pila nunca se desincroniza.
    """
    out = []
    for m in TAG_OPEN_RE.finditer(src):
        closing, name = m.group(1), m.group(2)
        i = m.end()
        depth_brace = depth_brack = 0
        quote = None
        while i < len(src):
            ch = src[i]
            if quote:
                if ch == quote and src[i - 1] != "\\":
                    quote = None
            elif ch in "'\"`":
                quote = ch
            elif ch == "{":
                depth_brace += 1
            elif ch == "}":
                depth_brace -= 1
            elif ch == "[":
                depth_brack += 1
            elif ch == "]":
                depth_brack -= 1
            elif ch == ">" and depth_brace <= 0 and depth_brack <= 0:
                break
            i += 1
        if i >= len(src):
            continue
        attrs = src[m.end():i]
        selfclose = "/" if attrs.rstrip().endswith("/") else ""
        out.append(Tag(closing, name, attrs, selfclose, m.start(), i + 1))
    return out


def surfaces_from_attrs(attrs, sheet, registry, tag):
    """Devuelve (rgb, etiqueta) que este elemento aporta como fondo, o None."""
    m = re.search(r"style=\{\{([^{}]*)\}\}", attrs)
    if m:
        bm = re.search(r"backgroundColor\s*:\s*(colors\.\w+|'[^']*')", m.group(1))
        if bm:
            c = resolve_color(bm.group(1), over=WHITE)
            if c:
                return c, f"inline {label(bm.group(1))}"
    for km in re.finditer(r"styles\.(\w+)", attrs):
        ent = sheet.get(km.group(1))
        if ent and ent.get("backgroundColor") and "transparent" not in ent["backgroundColor"]:
            c = resolve_color(ent["backgroundColor"], over=WHITE)
            if c:
                return c, f"styles.{km.group(1)} = {label(ent['backgroundColor'])}"
    if tag in registry:
        return registry[tag]
    return None


def audit():
    registry = build_surface_registry()
    findings, unresolved = [], []
    stats = defaultdict(int)

    for rel in iter_files():
        src = open(os.path.join(MOBILE, rel), encoding="utf-8").read()
        sheet = parse_stylesheet(src)
        stats["files"] += 1

        # superficie raíz del archivo (fallback): el estilo de contenedor
        root_bg = None
        rootm = re.search(r"return \(\s*<\w+[^>]*?style=\{\[?\s*styles\.(\w+)", src, re.S)
        if rootm and rootm.group(1) in sheet:
            e = sheet[rootm.group(1)]
            if e.get("backgroundColor"):
                root_bg = (resolve_color(e["backgroundColor"], over=WHITE),
                           f"raíz styles.{rootm.group(1)} = {label(e['backgroundColor'])}")

        stack = []

        def current():
            for s in reversed(stack):
                if s:
                    return s
            return root_bg

        for m in scan_tags(src):
            closing, tag, attrs, selfclose = m.groups()
            lineno = src.count("\n", 0, m.start) + 1

            if closing:
                if stack:
                    stack.pop()
                continue

            contrib = surfaces_from_attrs(attrs, sheet, registry, tag)

            # ---- ¿este elemento pinta texto?
            fg_exprs = []
            large = False
            for km in re.finditer(r"styles\.(\w+)", attrs):
                ent = sheet.get(km.group(1))
                if ent and ent.get("color"):
                    fg_exprs.append((ent["color"], f"styles.{km.group(1)}"))
                    large = large or ent.get("large", False)
            cm = re.search(r"\bcolor=\{(colors\.\w+|'[^']*')\}", attrs)
            is_icon = tag in ("Ionicons", "ActivityIndicator", "MaterialIcons",
                              "Feather", "MaterialCommunityIcons")
            if cm:
                fg_exprs.append((cm.group(1), f"prop color= ({tag})"))
            im = re.search(r"\bsize=\{?(\d+)", attrs)
            if is_icon and im and int(im.group(1)) >= 24:
                large = True

            if fg_exprs:
                surf = current()
                if not surf or not surf[0]:
                    for fexpr, where in fg_exprs:
                        unresolved.append(dict(file=rel, line=lineno, fg=label(fexpr),
                                               where=where, tag=tag))
                else:
                    bg, bglab = surf
                    for fexpr, where in fg_exprs:
                        fg = resolve_color(fexpr, over=bg)
                        if not fg:
                            continue
                        stats["pairs_resolved"] += 1
                        r = round(ratio(fg, bg), 2)
                        # icono decorativo sin accessibilityLabel -> 1.4.11 no
                        # aplica; se registra pero se marca `decorative`.
                        decorative = is_icon and "accessibilityLabel" not in attrs
                        need = 3.0 if (large or is_icon) else 4.5
                        if r < need:
                            findings.append(dict(
                                file=rel, line=lineno, ratio=r, need=need,
                                fg=label(fexpr), bg=bglab, tag=tag, where=where,
                                large=large, icon=is_icon, decorative=decorative,
                                snippet=" ".join(
                                    src[m.start:m.end].split())[:130]))

            if not selfclose:
                stack.append(contrib)

    # dedup por (archivo, fg, bg, where)
    seen, out = set(), []
    for v in sorted(findings, key=lambda x: x["ratio"]):
        k = (v["file"], v["fg"], v["bg"], v["where"])
        if k in seen:
            continue
        seen.add(k)
        out.append(v)

    useen, uout = set(), []
    for v in unresolved:
        k = (v["file"], v["fg"], v["where"])
        if k in useen:
            continue
        useen.add(k)
        uout.append(v)

    return registry, out, uout, dict(stats)


def main():
    registry, findings, unresolved, stats = audit()

    print("=" * 78)
    print("ZAL-575 Tier G — motor JSX (superficie por ancestría real)")
    print("=" * 78)
    print(f"REPO      : {REPO}")
    print(f"archivos  : {stats.get('files')}")
    print(f"pares resueltos (texto sobre fondo conocido): {stats.get('pairs_resolved')}")
    print(f"pares sin fondo resoluble (NO reportados)   : {len(unresolved)}")
    print()

    print(f">>> registro de superficies de componente ({len(registry)})")
    for name, (rgb, lab) in sorted(registry.items()):
        print(f"    {name:<22} #{rgb[0]:02X}{rgb[1]:02X}{rgb[2]:02X}  ({lab})")
    print()

    real = [v for v in findings if not v["decorative"]]
    deco = [v for v in findings if v["decorative"]]

    print(f">>> VIOLACIONES accionables (texto + iconos con etiqueta): {len(real)}")
    for v in real:
        kind = "icono" if v["icon"] else ("texto grande" if v["large"] else "texto normal")
        print(f"\n    {v['ratio']:>5.2f}:1  <  {v['need']}   [{kind}]")
        print(f"        fg  {v['fg']}   ({v['where']})")
        print(f"        bg  {v['bg']}")
        print(f"        {v['file']}:{v['line']}   <{v['tag']}>")
        print(f"        {v['snippet']}")

    print()
    print(f">>> iconos decorativos por debajo del umbral (1.4.11 no aplica "
          f"sin etiqueta, pero pierden legibilidad): {len(deco)}")
    for v in deco:
        print(f"    {v['ratio']:>5.2f}:1  {v['fg']} sobre {v['bg']}")
        print(f"           {v['file']}:{v['line']} <{v['tag']}>")

    if unresolved:
        print()
        print(">>> sin fondo resoluble (declarado, no reportado como violación)")
        for v in unresolved[:20]:
            print(f"    {v['file']}:{v['line']} <{v['tag']}> {v['fg']} ({v['where']})")
        if len(unresolved) > 20:
            print(f"    … +{len(unresolved) - 20} más")

    out = os.path.join(HERE, "zal575_tierG_jsx_results.json")
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(dict(repo=REPO,
                       registry={k: dict(rgb=list(v[0]), label=v[1])
                                 for k, v in registry.items()},
                       findings=findings, unresolved=unresolved, stats=stats),
                  fh, ensure_ascii=False, indent=2)
    print(f"\njson -> {out}")


if __name__ == "__main__":
    main()
