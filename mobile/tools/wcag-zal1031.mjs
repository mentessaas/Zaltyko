function srgbToLin(c) {
  c /= 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function lum(hex) {
  hex = hex.replace('#', '');
  return (
    0.2126 * srgbToLin(parseInt(hex.slice(0, 2), 16)) +
    0.7152 * srgbToLin(parseInt(hex.slice(2, 4), 16)) +
    0.0722 * srgbToLin(parseInt(hex.slice(4, 6), 16))
  );
}
function ratio(a, b) {
  const l1 = lum(a);
  const l2 = lum(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
const cases = [
  ['label (textInverse=#FFFFFF) sobre bg (#0F172A)', '#FFFFFF', '#0F172A', 4.5],
  ['error (onDarkDanger=#FCA5A5) sobre bg (#0F172A)', '#FCA5A5', '#0F172A', 4.5],
  ['hint  (onDarkMuted=#94A3B8) sobre bg (#0F172A)', '#94A3B8', '#0F172A', 4.5],
  ['label (text=#0F172A) sobre surface (#FFFFFF) [regresion light]', '#0F172A', '#FFFFFF', 4.5],
  ['error (danger=#DC2626) sobre surface (#FFFFFF) [regresion light]', '#DC2626', '#FFFFFF', 4.5],
  ['hint  (textMuted=#64748B) sobre surface (#FFFFFF) [regresion light]', '#64748B', '#FFFFFF', 4.5],
];
for (const [name, fg, bg, min] of cases) {
  const r = ratio(fg, bg);
  const pass = r >= min ? 'PASS' : 'FAIL';
  console.log(pass + '  ' + r.toFixed(2) + ':1 (min ' + min + ')  ' + name + '  [WCAG 1.4.3]');
}
