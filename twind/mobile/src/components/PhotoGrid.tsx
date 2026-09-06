/**
 * Listing photo grid with an "add" tile. The first photo carries the required
 * "modelled fit" toggle: the seller must confirm it shows the item worn.
 */
import React from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import type { DraftPhoto } from '../store/ui';
import { colors, radius, spacing, type } from '../theme';

type Props = {
  photos: DraftPhoto[];
  onAdd: () => void;
  onRemove: (localUri: string) => void;
  onToggleModelled: (localUri: string, value: boolean) => void;
  max?: number;
  error?: string | null;
};

export function PhotoGrid({ photos, onAdd, onRemove, onToggleModelled, max = 6, error }: Props) {
  const first = photos[0];
  return (
    <View>
      <View style={styles.grid}>
        {photos.map((p, idx) => (
          <View key={p.local_uri} style={styles.tile}>
            <Image source={{ uri: p.local_uri }} style={styles.image} />
            {idx === 0 ? (
              <View style={styles.coverTag}>
                <Text style={styles.coverText}>Cover</Text>
              </View>
            ) : null}
            {p.uploading ? (
              <View style={styles.overlay}>
                <ActivityIndicator color={colors.surface} />
              </View>
            ) : null}
            {p.error ? (
              <View style={[styles.overlay, { backgroundColor: 'rgba(185,28,28,0.7)' }]}>
                <Text style={styles.overlayText}>Upload failed</Text>
              </View>
            ) : null}
            <Pressable
              onPress={() => onRemove(p.local_uri)}
              style={styles.remove}
              accessibilityRole="button"
              accessibilityLabel="Remove photo"
              hitSlop={6}
            >
              <Text style={styles.removeText}>×</Text>
            </Pressable>
          </View>
        ))}
        {photos.length < max ? (
          <Pressable onPress={onAdd} style={[styles.tile, styles.add]} accessibilityRole="button" accessibilityLabel="Add photo">
            <Text style={styles.addPlus}>+</Text>
            <Text style={type.caption}>{photos.length === 0 ? 'Add photos' : 'Add'}</Text>
          </Pressable>
        ) : null}
      </View>

      {first ? (
        <View style={styles.modelledRow}>
          <View style={{ flex: 1 }}>
            <Text style={type.label}>This photo shows the item worn (modelled fit photo)</Text>
            <Text style={type.small}>Required. Buyers compare the fit on a body, not on a hanger.</Text>
          </View>
          <Switch
            value={first.is_modelled_fit}
            onValueChange={(v) => onToggleModelled(first.local_uri, v)}
            trackColor={{ true: colors.primary, false: colors.border }}
            accessibilityLabel="First photo shows the item worn"
          />
        </View>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const TILE = 104;

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: {
    width: TILE,
    height: TILE * 1.25,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
    position: 'relative',
  },
  image: { width: '100%', height: '100%' },
  add: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  addPlus: { fontSize: 28, color: colors.primary, lineHeight: 32 },
  coverTag: {
    position: 'absolute',
    left: 6,
    top: 6,
    backgroundColor: 'rgba(31,26,23,0.75)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  coverText: { color: colors.surface, fontSize: 10, fontWeight: '600' },
  overlay: {
    position: 'absolute',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlayText: { color: colors.surface, fontSize: 11, fontWeight: '600' },
  remove: {
    position: 'absolute',
    right: 4,
    top: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(31,26,23,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeText: { color: colors.surface, fontSize: 16, lineHeight: 18, fontWeight: '700' },
  modelledRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  error: { ...type.small, color: colors.danger, marginTop: spacing.sm },
});
