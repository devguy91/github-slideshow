/**
 * Single source of truth for colours, spacing and type. No UI kit: every
 * component and screen pulls from here so the app stays visually consistent.
 */
export const colors = {
  bg: '#FFF7F0',
  surface: '#FFFFFF',
  surfaceAlt: '#F6EEE6',
  border: '#E9DED3',
  text: '#1F1A17',
  textMuted: '#6F655D',
  textFaint: '#A3988E',
  primary: '#E8643C',
  primaryDark: '#C9502C',
  onPrimary: '#FFFFFF',
  /** Fit score badge palette (teal). Always distinct from style. */
  fit: '#0F766E',
  fitBg: '#D9F2EE',
  /** Style score badge palette (plum). Always distinct from fit. */
  style: '#7E22CE',
  styleBg: '#EFE1FB',
  success: '#15803D',
  successBg: '#DCFCE7',
  warning: '#B45309',
  warningBg: '#FEF3C7',
  danger: '#B91C1C',
  dangerBg: '#FEE2E2',
  twin: '#0369A1',
  twinBg: '#E0F2FE',
  following: '#92400E',
  followingBg: '#FEF3C7',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
  pill: 999,
} as const;

export const type = {
  h1: { fontSize: 28, fontWeight: '700' as const, color: colors.text, lineHeight: 34 },
  h2: { fontSize: 22, fontWeight: '700' as const, color: colors.text, lineHeight: 28 },
  h3: { fontSize: 17, fontWeight: '600' as const, color: colors.text, lineHeight: 22 },
  body: { fontSize: 15, fontWeight: '400' as const, color: colors.text, lineHeight: 21 },
  bodyMuted: { fontSize: 15, fontWeight: '400' as const, color: colors.textMuted, lineHeight: 21 },
  small: { fontSize: 13, fontWeight: '400' as const, color: colors.textMuted, lineHeight: 18 },
  label: { fontSize: 13, fontWeight: '600' as const, color: colors.text, lineHeight: 18 },
  caption: { fontSize: 11, fontWeight: '500' as const, color: colors.textFaint, lineHeight: 14 },
} as const;

export const shadow = {
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
} as const;
