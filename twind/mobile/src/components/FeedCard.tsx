import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { FeedCard as FeedCardModel } from '../api/types';
import { formatPence } from '../lib/format';
import { colors, radius, shadow, spacing, type } from '../theme';
import { ReasonTag } from './ReasonTag';
import { ScoreBadge } from './ScoreBadge';
import { ImagePlaceholder } from './ui';

type Props = { card: FeedCardModel; compact?: boolean };

/** Total body-measurement fields the fit engine can use for this category. */
function totalFieldsFor(category: string): number {
  switch (category) {
    case 'bottoms':
      return 5; // outseam, inseam, rise, waist, hip
    case 'tops':
      return 3; // shoulder, torso_length, bust
    case 'dresses':
      return 4; // shoulder, torso_length, waist, hip
    default:
      return 0;
  }
}

export function FeedCardView({ card, compact = false }: Props) {
  const router = useRouter();
  const { listing } = card;
  const photo = listing.photos[0]?.url;
  const fieldsUsed = listing.match?.fields_used;

  return (
    <Pressable
      onPress={() => router.push(`/listing/${listing.id}`)}
      accessibilityRole="button"
      accessibilityLabel={`${listing.title}, ${formatPence(listing.price_pence)}`}
      style={({ pressed }) => [styles.card, compact && styles.compact, pressed && { opacity: 0.9 }]}
    >
      <View style={[styles.imageWrap, compact && styles.imageCompact]}>
        {photo ? (
          <Image source={{ uri: photo }} style={styles.image} resizeMode="cover" />
        ) : (
          <ImagePlaceholder style={styles.image} />
        )}
        <View style={styles.reason}>
          <ReasonTag reason={card.reason} />
        </View>
      </View>
      <View style={styles.body}>
        <View style={styles.scores}>
          <ScoreBadge
            kind="fit"
            score={card.fit_score}
            confidence={card.fit_confidence}
            fieldsUsed={fieldsUsed}
            totalFields={fieldsUsed ? totalFieldsFor(listing.category) : undefined}
            size="sm"
            showConfidenceText={false}
          />
          <ScoreBadge kind="style" score={card.style_score} size="sm" />
        </View>
        <Text style={[type.label, { marginTop: spacing.xs }]} numberOfLines={compact ? 1 : 2}>
          {listing.title}
        </Text>
        <Text style={type.small} numberOfLines={1}>
          {[listing.brand, listing.size_label].filter(Boolean).join(' · ')}
        </Text>
        <Text style={[type.body, { fontWeight: '700', marginTop: 2 }]}>{formatPence(listing.price_pence)}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  compact: { width: 160 },
  imageWrap: { aspectRatio: 3 / 4, backgroundColor: colors.surfaceAlt, position: 'relative' },
  imageCompact: { aspectRatio: 1 },
  image: { width: '100%', height: '100%', borderRadius: 0 },
  reason: { position: 'absolute', top: spacing.sm, left: spacing.sm },
  body: { padding: spacing.md },
  scores: { flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' },
});
