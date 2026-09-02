#!/usr/bin/env python3
"""
ZAL-575 Tier G — pase 3: análisis PARAMÉTRICO por sitio de llamada.

El pase 2 (`zal575_tierG_jsx_resolver.py`) resuelve la superficie por ancestría
dentro de un archivo, pero deja 20 textos "sin fondo resoluble": son textos que
viven en un componente SIN fondo propio, y cuyo color real depende de dónde se
monte ese componente.

El caso que motivó este pase (verificado a mano):

    components/ui/Input.tsx
      styles.wrap  = { gap: spacing.xs }          <- SIN backgroundColor
      styles.label = { color: colors.text }        <- #0F172A
      styles.input = { backgroundColor: colors.surface }  <- la CAJA es blanca,
                                                              pero el label va
                                                              FUERA de la caja

    app/(auth)/login.tsx
      styles.flex = { backgroundColor: colors.bg } <- #0F172A
      <View style={styles.form}>                   <- SIN fondo
        <Input label="Email" />

    => el label "Email" se pinta #0F172A sobre #0F172A = 1.00:1. INVISIBLE.

Ningún pase por archivo puede ver eso: el color está en Input.tsx y el fondo en
login.tsx. Este pase cruza esa frontera.

Método
------
1. Para cada componente, extraer sus "textos transparentes": estilos con
   `color` cuyo ancestro dentro del propio componente NO aporta fondo.
2. Para cada sitio de llamada `<Componente …>`, resolver la superficie del
   llamador (reutilizando la pila JSX del pase 2).
3. Evaluar cada texto transparente contra cada superficie de montaje distinta.

Un componente montado en N superficies distintas se evalúa N veces: puede pasar
en unas y fallar en otras (Input pasa dentro de los modales y falla en login).

Reproducibilidad: `python3 zal575_tierG_callsites.py` (solo stdlib).
"""

import importlib.util
import json
import os
import re
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))


def _load(name, fn):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, fn))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


R = _load("tierg_jsx", "zal575_tierG_jsx_resolver.py")

MOBILE = R.MOBILE
TOKENS = R.TOKENS
WHITE = R.WHITE
ratio = R.ratio
resolve_color = R.resolve_color
label = R.label
parse_stylesheet = R.parse_stylesheet
iter_files = R.iter_files
scan_tags = R.scan_tags
surfaces_from_attrs = R.surfaces_from_attrs


def hexs(rgb):
    return "#%02X%02X%02X" % rgb


# ------------------------------------------------ 1. textos transparentes

def transparent_texts(rel, src, sheet):
    """Textos del componente cuyo fondo NO lo aporta el propio componente."""
    out = []
    stack = []
    for m in scan_tags(src):
        closing, tag, attrs, selfclose = m.groups()
        if closing:
            if stack:
                stack.pop()
            continue
        contrib = surfaces_from_attrs(attrs, sheet, {}, tag)
        has_bg = any(s for s in stack) or contrib

        fgs = []
        large = False
        for km in re.finditer(r"styles\.(\w+)", attrs):
            ent = sheet.get(km.group(1))
            if ent and ent.get("color"):
                fgs.append((ent["color"], f"styles.{km.group(1)}"))
                large = large or ent.get("large", False)
        cm = re.search(r"\bcolor=\{(colors\.\w+|'[^']*')\}", attrs)
        is_icon = tag in ("Ionicons", "ActivityIndicator", "MaterialIcons",
                          "Feather", "MaterialCommunityIcons")
        if cm:
            fgs.append((cm.group(1), f"prop color= ({tag})"))

        if fgs and not has_bg:
            for fexpr, where in fgs:
                out.append(dict(file=rel, line=src.count("\n", 0, m.start) + 1,
                                fg=fexpr, where=where, tag=tag,
                                large=large, icon=is_icon,
                                labelled="accessibilityLabel" in attrs
                                         or "nativeID" in attrs))
        if not selfclose:
            stack.append(contrib)
    # dedup por (fg, where)
    seen, ded = set(), []
    for v in out:
        k = (v["fg"], v["where"])
        if k in seen:
            continue
        seen.add(k)
        ded.append(v)
    return ded


# ------------------------------------------------ 2. superficies de montaje

def mount_surfaces(registry):
    """ComponentName -> {(rgb, etiqueta): [sitios de llamada]}"""
    mounts = defaultdict(lambda: defaultdict(list))
    for rel in iter_files():
        src = open(os.path.join(MOBILE, rel), encoding="utf-8").read()
        sheet = parse_stylesheet(src)

        root_bg = None
        rootm = re.search(r"return \(\s*<\w+[^>]*?style=\{\[?\s*styles\.(\w+)",
                          src, re.S)
        if rootm and rootm.group(1) in sheet:
            e = sheet[rootm.group(1)]
            if e.get("backgroundColor"):
                c = resolve_color(e["backgroundColor"], over=WHITE)
                if c:
                    root_bg = (c, f"{os.path.basename(rel)} raíz "
                                  f"styles.{rootm.group(1)} = "
                                  f"{label(e['backgroundColor'])}")

        stack = []
        for m in scan_tags(src):
            closing, tag, attrs, selfclose = m.groups()
            if closing:
                if stack:
                    stack.pop()
                continue
            contrib = surfaces_from_attrs(attrs, sheet, registry, tag)

            # ¿es el montaje de un componente que nos interesa?
            surf = None
            for s in reversed(stack):
                if s:
                    surf = s
                    break
            if surf is None:
                surf = root_bg
            if surf and surf[0]:
                mounts[tag][(surf[0], surf[1])].append(
                    f"{rel}:{src.count(chr(10), 0, m.start) + 1}")

            if not selfclose:
                stack.append(contrib)
    return mounts


def main():
    registry = R.build_surface_registry()
    mounts = mount_surfaces(registry)

    # textos transparentes por componente
    comp_texts = {}
    for rel in iter_files():
        if not rel.startswith("components/"):
            continue
        name = os.path.basename(rel)[:-4]
        src = open(os.path.join(MOBILE, rel), encoding="utf-8").read()
        tt = transparent_texts(rel, src, parse_stylesheet(src))
        if tt:
            comp_texts[name] = tt

    print("=" * 78)
    print("ZAL-575 Tier G — pase 3: contraste PARAMÉTRICO por sitio de llamada")
    print("=" * 78)
    print(f"componentes con texto sin fondo propio : {len(comp_texts)}")
    print(f"componentes con montaje conocido       : "
          f"{len([c for c in comp_texts if c in mounts])}")
    print()

    violations, passes = [], []
    for comp, texts in sorted(comp_texts.items()):
        surfaces = mounts.get(comp)
        if not surfaces:
            continue
        for (bg, bglab), sites in sorted(surfaces.items(), key=lambda kv: kv[0]):
            for t in texts:
                fg = resolve_color(t["fg"], over=bg)
                if not fg:
                    continue
                r = round(ratio(fg, bg), 2)
                need = 3.0 if (t["large"] or t["icon"]) else 4.5
                rec = dict(component=comp, decl=f"{t['file']}:{t['line']}",
                           where=t["where"], fg=label(t["fg"]),
                           bg=hexs(bg), bg_label=bglab, ratio=r, need=need,
                           large=t["large"], icon=t["icon"],
                           mounted_at=sorted(set(sites)))
                (violations if r < need else passes).append(rec)

    violations.sort(key=lambda v: v["ratio"])

    print(f">>> VIOLACIONES por montaje: {len(violations)}")
    for v in violations:
        kind = "icono" if v["icon"] else ("texto grande" if v["large"] else "texto")
        print(f"\n  {v['ratio']:>5.2f}:1  <  {v['need']}   [{kind}]   "
              f"{v['component']}.{v['where']}")
        print(f"      fg  {v['fg']}")
        print(f"      bg  {v['bg']}   ({v['bg_label']})")
        print(f"      declarado en  {v['decl']}")
        print(f"      montado en    {', '.join(v['mounted_at'][:6])}"
              + (f"  (+{len(v['mounted_at']) - 6})" if len(v["mounted_at"]) > 6 else ""))

    print()
    print(f">>> combinaciones que PASAN (mismo componente, otra superficie): "
          f"{len(passes)}")
    bycomp = defaultdict(set)
    for p in passes:
        bycomp[p["component"]].add((p["bg"], round(p["ratio"], 2), p["where"]))
    for comp in sorted(bycomp):
        rows = sorted(bycomp[comp])
        print(f"    {comp}: " + ", ".join(f"{w} {r}:1 sobre {b}"
                                          for b, r, w in rows[:4]))

    out = os.path.join(HERE, "zal575_tierG_callsite_results.json")
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(dict(violations=violations, passes=passes,
                       components={k: v for k, v in comp_texts.items()}),
                  fh, ensure_ascii=False, indent=2)
    print(f"\njson -> {out}")


if __name__ == "__main__":
    main()
