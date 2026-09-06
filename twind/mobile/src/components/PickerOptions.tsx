/**
 * Shared 3-up image chooser for the style and body pickers. Images come from the
 * API (`image_url`); an empty URL renders a neutral placeholder, never a bundled photo.
 */
import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { PickerOption } from '../api/types';
import { colors, radius, spacing } from '../theme';
import { ImagePlaceholder } from './ui';

export function PickerOptions({
  options,
  selected,
  onSelect,
  disabled,
}: {
  options: PickerOption[];
  selected: 0 | 1 | 2 | null;
  onSelect: (index: 0 | 1 | 2) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.row}>
      {options.map((opt) => {
        const active = selected === opt.index;
        return (
          <Pressable
            key={opt.index}
            disabled={disabled}
            onPress={() => onSelect(opt.index)}
            accessibilityRole="button"
            accessibilityState={{ selected: active, disabled: !!disabled }}
            accessibilityLabel={`Option ${opt.index + 1}`}
            style={({ pressed }) => [styles.option, active && styles.optionActive, pressed && { opacity: 0.85 }]}
          >
            {opt.image_url ? (
              <Image source={{ uri: opt.image_url }} style={styles.image} resizeMode="cover" />
            ) : (
              <ImagePlaceholder style={styles.image} />
            )}
            <View style={styles.index}>
              <Text style={styles.indexText}>{opt.index + 1}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
  option: {
    flex: 1,
    aspectRatio: 2 / 3,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: 'transparent',
    backgroundColor: colors.surfaceAlt,
  },
  optionActive: { borderColor: colors.primary },
  image: { width: '100%', height: '100%', borderRadius: 0 },
  index: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(31,26,23,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  indexText: { color: colors.surface, fontSize: 12, fontWeight: '700' },
});
