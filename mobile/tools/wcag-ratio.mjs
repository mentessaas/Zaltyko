// Mobile WCAG 2.1 contrast ratio calculator.
// Deterministic, no dependencies. Uso:
//
//   node mobile/tools/wcag-ratio.mjs
//
// Salida: tabla PASS/FAIL con ratio medido y referencia al spec Tier H.

function srgbToLin(c) {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function luminance(hex) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 0.2126 * srgbToLin(r) + 0.7152 * srgbToLin(g) + 0.0722 * srgbToLin(b);
}

function ratio(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

function compositeLuminance(fgHex, alphaHex, bgHex) {
  const aa = parseInt(alphaHex.slice(7, 9), 16) / 255;
  const fg = luminance(fgHex);
  const bg = luminance(bgHex);
  return bg * (1 - aa) + fg * aa;
}

function compositeRatio(fgHex, alphaHex, bgHex) {
  const fgLin = compositeLuminance(fgHex, alphaHex, bgHex);
  const bgLin = luminance(bgHex);
  const [hi, lo] = fgLin > bgLin ? [fgLin, bgLin] : [bgLin, fgLin];
  return (hi + 0.05) / (lo + 0.05);
}

const T = {
  primary: '#4F46E5',
  primaryHover: '#4338CA',
  primaryFg: '#FFFFFF',
  primarySoftHex: '#6366F1',
  primarySoftAlpha: '#6366F126',
  primarySoftPressedHex: '#4F46E5',
  primarySoftPressedAlpha: '#4F46E547', // 0.28 * 255 ≈ 71
  surface: '#FFFFFF',
  surfaceMuted: '#F8FAFC',
  surfacePressed: '#E2E8F0',
  bg: '#0F172A',
  text: '#0F172A',
  success: '#16A34A',
  successPressed: '#15803D',
  warning: '#F59E0B',
  warningPressed: '#B45309',
  danger: '#DC2626',
  dangerPressed: '#B91C1C',
  info: '#0EA5E9',
  infoPressed: '#0369A1',
};

const rows = [];
function check(name, fg, bg, threshold) {
  const r = ratio(fg, bg);
  const pass = r >= threshold;
  rows.push(
    `${pass ? 'PASS' : 'FAIL'} ${threshold.toFixed(1)}  ${r.toFixed(2)}  ${name}`
  );
}

// Texto WCAG AA ≥4.5:1
check('Button primary rest:     primaryFg on primary',         T.primaryFg, T.primary, 4.5);
check('Button primary pressed:  primaryFg on primaryHover',    T.primaryFg, T.primaryHover, 4.5);
check('Button secondary rest:   text on surface',              T.text, T.surface, 4.5);
check('Button secondary pressed:text on surfaceMuted',         T.text, T.surfaceMuted, 4.5);
check('Button ghost pressed:    primary on surfaceMuted',       T.primary, T.surfaceMuted, 4.5);
check('Button danger rest:      primaryFg on danger',          T.primaryFg, T.danger, 4.5);
check('Button danger pressed:   primaryFg on dangerPressed',   T.primaryFg, T.dangerPressed, 4.5);

// StudentRow active chips (post-fix: success/warning/info con texto oscuro,
// danger con blanco — danger sigue siendo blanco porque ya pasa AA)
check('StudentRow active success: text on success',     T.text, T.success, 4.5);
check('StudentRow active warning: text on warning',     T.text, T.warning, 4.5);
check('StudentRow active danger:  white on danger',     T.primaryFg, T.danger, 4.5);
check('StudentRow active info:    text on info',        T.text, T.info, 4.5);

// StudentRow border-only (rest state) — texto semántico sobre surface
check('StudentRow rest success:   success on surface',  T.success, T.surface, 4.5);
check('StudentRow rest warning:   warning on surface',  T.warning, T.surface, 4.5);
check('StudentRow rest danger:    danger on surface',   T.danger, T.surface, 4.5);
check('StudentRow rest info:      info on surface',     T.info, T.surface, 4.5);

// Banner texts
check('SuccessBanner text on successSoft',  '#166534', '#F0FDF4', 4.5);
check('ErrorBanner text on errorSoft',      '#991B1B', '#FEF2F2', 4.5);
check('InfoBanner text on infoSoft',        '#1E40AF', '#EFF6FF', 4.5);

// UI pressed vs rest (WCAG 1.4.11 ≥3:1) — post-fix: border compound.
// El bg solo no pasa con surfaceMuted ni primarySoft; el BORDER sí pasa:
//   ChildCard: border primary (#4F46E5) sobre surface (#FFFFFF) = 6.29:1
//   NextClassCard cta: border primaryHover (#4338CA) sobre surface = 7.90:1
rows.push(
  `${ratio(T.primary, T.surface) >= 3 ? 'PASS' : 'FAIL'} 3.0  ${ratio(T.primary, T.surface).toFixed(2)}  ChildCard pressed BORDER (primary on surface)`
);
rows.push(
  `${ratio(T.primaryHover, T.surface) >= 3 ? 'PASS' : 'FAIL'} 3.0  ${ratio(T.primaryHover, T.surface).toFixed(2)}  NextClassCard ctaPressed BORDER (primaryHover on surface)`
);

// Sanity: tokens nuevos creados para uso futuro (>=3:1)
rows.push(
  `${ratio(T.surfacePressed, T.surface) >= 3 ? 'PASS' : 'FAIL'} 3.0  ${ratio(T.surfacePressed, T.surface).toFixed(2)}  Token surfacePressed (#E2E8F0 vs surface) — informativo`
);
rows.push(
  `${compositeRatio(T.primarySoftPressedHex, T.primarySoftPressedAlpha, T.surface) >= 3 ? 'PASS' : 'FAIL'} 3.0  ${compositeRatio(T.primarySoftPressedHex, T.primarySoftPressedAlpha, T.surface).toFixed(2)}  Token primarySoftPressed (compound over surface) — informativo`
);

// Disabled overlay distinto de pressed (sanity visual, no WCAG directo)
rows.push(`INFO -     ${ratio('#F1F5F9', T.surfacePressed).toFixed(2)}  Disabled (disabledOverlay #F1F5F9) vs Pressed token (surfacePressed)`);
rows.push(`INFO -     ${ratio('#F1F5F9', T.primary).toFixed(2)}  Disabled (disabledOverlay #F1F5F9) vs Pressed border (primary)`);

console.log('=== Tier H WCAG ratios (mobile) ===');
rows.forEach((r) => console.log(r));