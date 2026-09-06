/**
 * Renders ONE score: either fit or style. The two are separate product concepts and
 * must never be averaged or combined into a single number. Render two ScoreBadges
 * side by side when both are available.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { describeConfidence, formatPercent } from '../lib/format';
import { colors, radius, spacing } from '../theme';

export type ScoreKind = 'fit' | 'style';

type Props = {
  kind: ScoreKind;
  score: number;
  /** Only meaningful for kind="fit". 0..1 from the API. */
  confidence?: number;
  fieldsUsed?: string[];
  totalFields?: number;
  size?: 'sm' | 'md' | 'lg';
  /** Show the confidence phrase under the fit badge (default: true for md/lg). */
  showConfidenceText?: boolean;
};

const palette: Record<ScoreKind, { fg: string; bg: string; label: string }> = {
  fit: { fg: colors.fit, bg: colors.fitBg, label: 'Fit' },
  style: { fg: colors.style, bg: colors.styleBg, label: 'Style' },
};

export function ScoreBadge({ kind, score, confidence, fieldsUsed, totalFields, size = 'md', showConfidenceText }: Props) {
  const p = palette[kind];
  const showText = showConfidenceText ?? size !== 'sm';
  const hasConfidence = kind === 'fit' && typeof confidence === 'number';
  const dots = hasConfidence ? Math.max(1, Math.min(4, Math.round((confidence ?? 0) * 4))) : 0;
  const a11y = `${p.label} ${formatPercent(score)}${hasConfidence ? `, ${describeConfidence(confidence ?? 0, fieldsUsed, totalFields)}` : ''}`;

  return (
    <View accessibilityLabel={a11y} accessible style={styles.wrap}>
      <View style={[styles.badge, sizes[size].badge, { backgroundColor: p.bg }]}>
        <Text style={[styles.label, sizes[size].label, { color: p.fg }]}>{p.label}</Text>
        <Text style={[styles.value, sizes[size].value, { color: p.fg }]}>{formatPercent(score)}</Text>
        {hasConfidence ? (
          <View style={styles.dots} accessibilityElementsHidden>
            {[0, 1, 2, 3].map((i) => (
              <View
                key={i}
                style={[styles.dot, sizes[size].dot, { backgroundColor: i < dots ? p.fg : p.fg + '33' }]}
              />
            ))}
          </View>
        ) : null}
      </View>
      {hasConfidence && showText ? (
        <Text style={[styles.confidence, { color: p.fg }]}>
          {describeConfidence(confidence ?? 0, fieldsUsed, totalFields)}
        </Text>
      ) : null}
    </View>
  );
}

/** Convenience: renders fit and style as two adjacent, separate badges. */
export function ScorePair({
  fit,
  style,
  confidence,
  fieldsUsed,
  totalFields,
  size = 'md',
}: {
  fit: number;
  style: number;
  confidence?: number;
  fieldsUsed?: string[];
  totalFields?: number;
  size?: 'sm' | 'md' | 'lg';
}) {
  return (
    <View style={styles.pair}>
      <ScoreBadge kind="fit" score={fit} confidence={confidence} fieldsUsed={fieldsUsed} totalFields={totalFields} size={size} />
      <ScoreBadge kind="style" score={style} size={size} />
    </View>
  );
}

const sizes = {
  sm: {
    badge: { paddingHorizontal: 8, paddingVertical: 3, gap: 4 },
    label: { fontSize: 10 },
    value: { fontSize: 12 },
    dot: { width: 4, height: 4 },
  },
  md: {
    badge: { paddingHorizontal: 10, paddingVertical: 5, gap: 6 },
    label: { fontSize: 11 },
    value: { fontSize: 15 },
    dot: { width: 5, height: 5 },
  },
  lg: {
    badge: { paddingHorizontal: 14, paddingVertical: 8, gap: 8 },
    label: { fontSize: 13 },
    value: { fontSize: 22 },
    dot: { width: 6, height: 6 },
  },
} as const;

const styles = StyleSheet.create({
  wrap: { alignItems: 'flex-start' },
  badge: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.pill },
  label: { fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
  value: { fontWeight: '700' },
  dots: { flexDirection: 'row', gap: 2, marginLeft: 2 },
  dot: { borderRadius: 999 },
  confidence: { fontSize: 11, marginTop: 3, marginLeft: 2 },
  pair: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start', flexWrap: 'wrap' },
});
