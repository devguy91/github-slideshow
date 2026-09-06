/**
 * Frames measurement precision as capability UNLOCKED, never as "profile incomplete".
 * Reads `unlocked` / `next_unlock` straight from the BodyProfile.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { BodyProfile } from '../api/types';
import { fieldLabel } from '../lib/format';
import { colors, radius, spacing, type } from '../theme';

const UNLOCK_LABELS: Record<string, string> = {
  exact_fit_scores: 'Exact fit scores',
  twin_matching: 'Twin matching',
  length_fit: 'Length fit',
  waist_fit: 'Waist fit',
  shoulder_fit: 'Shoulder fit',
  confirmed_fit: 'Confirmed fit',
};

function unlockLabel(key: string): string {
  return UNLOCK_LABELS[key] ?? key.replace(/_/g, ' ');
}

/** Body field that most plausibly unlocks the given capability (for the CTA). */
function suggestedField(nextUnlock: string, profile: BodyProfile): string | null {
  const missing = (['inseam_cm', 'outseam_cm', 'rise_cm', 'waist_cm', 'hip_cm', 'shoulder_cm', 'torso_length_cm'] as const).filter(
    (f) => profile[f] === null || profile[f] === undefined,
  );
  if (nextUnlock.includes('length') && missing.includes('inseam_cm')) return 'inseam_cm';
  if (nextUnlock.includes('waist') && missing.includes('waist_cm')) return 'waist_cm';
  if (nextUnlock.includes('shoulder') && missing.includes('shoulder_cm')) return 'shoulder_cm';
  return missing[0] ?? null;
}

export function PrecisionBanner({ profile }: { profile: BodyProfile | undefined }) {
  const router = useRouter();
  if (!profile) return null;

  const unlocked = profile.unlocked ?? [];
  const next = profile.next_unlock;
  const field = next ? suggestedField(next, profile) : null;

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Text style={styles.tier}>{profile.precision_tier}</Text>
        {unlocked.length > 0 ? (
          <Text style={[type.small, { flex: 1 }]} numberOfLines={2}>
            Unlocked: {unlocked.map(unlockLabel).join(', ')}
          </Text>
        ) : (
          <Text style={[type.small, { flex: 1 }]}>Your fit scores are ready to sharpen.</Text>
        )}
      </View>
      {next ? (
        <Pressable
          onPress={() => router.push('/measurements')}
          style={styles.cta}
          accessibilityRole="button"
        >
          <Text style={styles.ctaText}>
            {field ? `Add ${fieldLabel(field).toLowerCase()} to unlock ${unlockLabel(next).toLowerCase()}` : `Unlock ${unlockLabel(next).toLowerCase()}`}
          </Text>
          <Text style={styles.ctaArrow}>→</Text>
        </Pressable>
      ) : (
        <Text style={[type.small, { color: colors.success, marginTop: spacing.xs }]}>Everything unlocked. Nice.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.fitBg,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  tier: {
    ...type.caption,
    color: colors.fit,
    fontWeight: '700',
    textTransform: 'uppercase',
    backgroundColor: colors.surface,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  cta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm },
  ctaText: { ...type.label, color: colors.fit, flex: 1 },
  ctaArrow: { ...type.label, color: colors.fit },
});
