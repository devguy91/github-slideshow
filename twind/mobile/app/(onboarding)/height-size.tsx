import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSubmitHeightSize } from '@/api/hooks';
import { errorMessage } from '@/api/client';
import { Banner, Button, ProgressBar, Screen, ScrollPicker, Spacer, T, UK_SIZES, heightItems } from '@/components';
import { useUiStore } from '@/store/ui';
import { spacing } from '@/theme';

const HEIGHTS = heightItems(140, 200);

export default function HeightSize() {
  const router = useRouter();
  const { heightCm, usualSize, setHeightSize, setOnboardingStep } = useUiStore();
  const [height, setHeight] = useState<number>(heightCm ?? 165);
  const [size, setSize] = useState<string>(usualSize ?? 'UK 12');
  const submit = useSubmitHeightSize();
  const [error, setError] = useState<string | null>(null);

  async function next() {
    setError(null);
    setHeightSize(height, size);
    try {
      const res = await submit.mutateAsync({ height_cm: height, usual_size: size });
      if (res.slice.is_open) {
        setOnboardingStep('body');
        router.replace('/(onboarding)/body');
      } else {
        setOnboardingStep('waitlist');
        router.replace('/(onboarding)/waitlist');
      }
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <Screen>
      <ProgressBar value={0.35} />
      <Spacer />
      <T v="h2">How tall are you, and what do you usually buy?</T>
      <T v="bodyMuted" style={{ marginTop: spacing.xs }}>
        Two things every good match starts with. You can refine everything else later.
      </T>
      <Spacer size={spacing.xxl} />
      <View style={styles.pickers}>
        <ScrollPicker items={HEIGHTS} value={height} onChange={setHeight} label="Height" width={190} testID="height-picker" />
        <ScrollPicker items={UK_SIZES} value={size} onChange={setSize} label="Usual size" width={130} testID="size-picker" />
      </View>
      <Spacer size={spacing.xl} />
      <T v="small" center>
        Selected: {height} cm · {size}
      </T>
      {error ? (
        <>
          <Spacer size={spacing.md} />
          <Banner tone="danger">{error}</Banner>
        </>
      ) : null}
      <View style={{ flex: 1 }} />
      <Spacer />
      <Button title="Continue" onPress={() => void next()} loading={submit.isPending} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  pickers: { flexDirection: 'row', justifyContent: 'center', gap: spacing.md },
});
