/**
 * Vertical snapping wheel picker built from a FlatList (no native dependency).
 */
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { FlatList, StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { colors, radius, type } from '../theme';

const ITEM_HEIGHT = 44;
const VISIBLE = 5;

export type PickerItem<T extends string | number> = { value: T; label: string };

type Props<T extends string | number> = {
  items: PickerItem<T>[];
  value: T | null;
  onChange: (value: T) => void;
  label?: string;
  width?: number;
  testID?: string;
};

export function ScrollPicker<T extends string | number>({ items, value, onChange, label, width = 140, testID }: Props<T>) {
  const listRef = useRef<FlatList<PickerItem<T>>>(null);
  const selectedIndex = useMemo(() => Math.max(0, items.findIndex((i) => i.value === value)), [items, value]);
  const lastEmitted = useRef<number>(selectedIndex);

  useEffect(() => {
    // Scroll to the initial/external value once items are available.
    if (items.length > 0) {
      listRef.current?.scrollToOffset({ offset: selectedIndex * ITEM_HEIGHT, animated: false });
      lastEmitted.current = selectedIndex;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length]);

  const onMomentumEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const idx = Math.min(items.length - 1, Math.max(0, Math.round(e.nativeEvent.contentOffset.y / ITEM_HEIGHT)));
      const item = items[idx];
      if (item && idx !== lastEmitted.current) {
        lastEmitted.current = idx;
        onChange(item.value);
      }
    },
    [items, onChange],
  );

  const pad = ((VISIBLE - 1) / 2) * ITEM_HEIGHT;

  return (
    <View style={{ width }} testID={testID}>
      {label ? <Text style={[type.label, { textAlign: 'center', marginBottom: 6 }]}>{label}</Text> : null}
      <View style={styles.wheel}>
        <View pointerEvents="none" style={styles.highlight} />
        <FlatList
          ref={listRef}
          data={items}
          keyExtractor={(i) => String(i.value)}
          showsVerticalScrollIndicator={false}
          snapToInterval={ITEM_HEIGHT}
          decelerationRate="fast"
          bounces={false}
          getItemLayout={(_, index) => ({ length: ITEM_HEIGHT, offset: ITEM_HEIGHT * index, index })}
          contentContainerStyle={{ paddingVertical: pad }}
          onMomentumScrollEnd={onMomentumEnd}
          onScrollEndDrag={onMomentumEnd}
          initialNumToRender={VISIBLE + 4}
          renderItem={({ item, index }) => {
            const active = index === selectedIndex;
            return (
              <View style={styles.item} accessibilityRole="menuitem" accessibilityState={{ selected: active }}>
                <Text style={[styles.itemText, active && styles.itemTextActive]}>{item.label}</Text>
              </View>
            );
          }}
        />
      </View>
    </View>
  );
}

/** Helpers for the height/size onboarding pickers. */
export function heightItems(min = 140, max = 200): PickerItem<number>[] {
  const out: PickerItem<number>[] = [];
  for (let cm = min; cm <= max; cm++) {
    const totalIn = Math.round(cm / 2.54);
    out.push({ value: cm, label: `${cm} cm  ·  ${Math.floor(totalIn / 12)}'${totalIn % 12}"` });
  }
  return out;
}

export const UK_SIZES: PickerItem<string>[] = [4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28].map((n) => ({
  value: `UK ${n}`,
  label: `UK ${n}`,
}));

const styles = StyleSheet.create({
  wheel: {
    height: ITEM_HEIGHT * VISIBLE,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  highlight: {
    position: 'absolute',
    top: ((VISIBLE - 1) / 2) * ITEM_HEIGHT,
    left: 8,
    right: 8,
    height: ITEM_HEIGHT,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  item: { height: ITEM_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  itemText: { fontSize: 16, color: colors.textFaint },
  itemTextActive: { color: colors.text, fontWeight: '700', fontSize: 18 },
});
