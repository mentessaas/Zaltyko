import { describe, it, expect, vi } from 'vitest';

vi.mock('react-native', () => ({
  StyleSheet: {
    create: <T extends Record<string, unknown>>(styles: T): T => styles,
  },
}));

// eslint-disable-next-line import/first
import { styles } from '@/components/attendance/StudentRow.styles';

const MIN_TOUCH = 44;

const numeric = (value: unknown): number | null => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) {
    return Number(value);
  }
  return null;
};

const meetsMin = (style: Record<string, unknown> | undefined): boolean => {
  if (!style) return false;
  const w = numeric(style.width);
  const h = numeric(style.height);
  const minW = numeric(style.minWidth);
  const minH = numeric(style.minHeight);
  const candidates = [w, h, minW, minH].filter((n): n is number => n !== null);
  return candidates.length > 0 && candidates.every((n) => n >= MIN_TOUCH);
};

describe('StudentRow touch targets (WCAG 2.5.5 Target Size Enhanced)', () => {
  it('exports a styles object', () => {
    expect(styles).toBeDefined();
    expect(typeof styles).toBe('object');
  });

  it('evaluateBtn ≥ 44x44dp (R-NEW-1)', () => {
    expect(meetsMin(styles.evaluateBtn as Record<string, unknown>)).toBe(true);
  });

  it('btn (OPTIONS present/late/absent/excused) ≥ 44x44dp (R-NEW-2)', () => {
    expect(meetsMin(styles.btn as Record<string, unknown>)).toBe(true);
  });
});
