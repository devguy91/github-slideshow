import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { usePickerRound, useSubmitStylePick } from '@/api/hooks';
import { errorMessage } from '@/api/client';
import { Banner, Button, ErrorState, LinkText, Loading, PickerOptions, ProgressBar, Screen, Spacer, T } from '@/components';
import { useUiStore } from '@/store/ui';
import { spacing } from '@/theme';

const ROUNDS = [1, 2, 3, 4] as const;
type Round = (typeof ROUNDS)[number];

export default function StylePicker() {
  const router = useRouter();
  const [round, setRound] = useState<Round>(1);
  const { styleChoices, setStyleChoice, skipStyle, setOnboardingStep } = useUiStore();
  const data = usePickerRound('style', round);
  const submit = useSubmitStylePick();
  const [error, setError] = useState<string | null>(null);

  const selected = styleChoices[round] ?? null;

  function goNext() {
    setOnboardingStep('height-size');
    router.replace('/(onboarding)/height-size');
  }

  async function choose(choice: 0 | 1 | 2) {
    setError(null);
    setStyleChoice(round, choice);
    try {
      await submit.mutateAsync({ round, choice });
      if (round < 4) setRound((round + 1) as Round);
      else goNext();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  function skip() {
    skipStyle();
    goNext();
  }

  return (
    <Screen>
      <ProgressBar value={(round - 1) / 4} />
      <Spacer />
      <T v="caption">Round {round} of 4</T>
      <T v="h2" style={{ marginTop: spacing.xs }}>
        Which would you wear?
      </T>
      <T v="bodyMuted" style={{ marginTop: spacing.xs }}>
        {data.data?.prompt ?? 'Tap the one closest to your taste. There are no wrong answers.'}
      </T>
      <Spacer />
      {data.isPending ? (
        <Loading />
      ) : data.isError ? (
        <ErrorState message={errorMessage(data.error)} onRetry={() => void data.refetch()} />
      ) : (
        <PickerOptions options={data.data.options} selected={selected} onSelect={(i) => void choose(i)} disabled={submit.isPending} />
      )}
      {error ? (
        <>
          <Spacer size={spacing.md} />
          <Banner tone="danger">{error}</Banner>
        </>
      ) : null}
      <View style={{ flex: 1 }} />
      <Spacer />
      {round > 1 ? (
        <Button title="Back" variant="ghost" onPress={() => setRound((round - 1) as Round)} disabled={submit.isPending} />
      ) : null}
      <Spacer size={spacing.md} />
      <View style={{ alignItems: 'center' }}>
        <LinkText title="Skip for now" onPress={skip} />
      </View>
    </Screen>
  );
}
