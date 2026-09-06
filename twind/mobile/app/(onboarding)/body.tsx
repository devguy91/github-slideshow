import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { usePickerRound, useSubmitBodyPick } from '@/api/hooks';
import { errorMessage } from '@/api/client';
import { Banner, Button, ErrorState, LinkText, Loading, PickerOptions, ProgressBar, Screen, Spacer, T } from '@/components';
import { useUiStore } from '@/store/ui';
import { spacing } from '@/theme';

const ROUNDS = [1, 2, 3] as const;
type Round = (typeof ROUNDS)[number];

export default function BodyPicker() {
  const router = useRouter();
  const [round, setRound] = useState<Round>(1);
  const { bodyChoices, setBodyChoice, skipBody, setOnboardingStep } = useUiStore();
  const data = usePickerRound('body', round);
  const submit = useSubmitBodyPick();
  const [error, setError] = useState<string | null>(null);

  const selected = bodyChoices[round] ?? null;

  function finish() {
    setOnboardingStep('done');
    router.replace('/(tabs)');
  }

  async function choose(choice: 0 | 1 | 2) {
    setError(null);
    setBodyChoice(round, choice);
    try {
      await submit.mutateAsync({ round, choice });
      if (round < 3) setRound((round + 1) as Round);
      else finish();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <Screen>
      <ProgressBar value={0.6 + ((round - 1) / 3) * 0.4} />
      <Spacer />
      <T v="caption">Round {round} of 3</T>
      <T v="h2" style={{ marginTop: spacing.xs }}>
        Which shape is closest to yours?
      </T>
      <T v="bodyMuted" style={{ marginTop: spacing.xs }}>
        {data.data?.prompt ?? 'Pick the closest match. This gives us a starting estimate; you can type exact garment measurements any time.'}
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
      <View style={{ alignItems: 'center', gap: spacing.md }}>
        <LinkText
          title="I'll enter my measurements instead"
          onPress={() => {
            setOnboardingStep('done');
            router.replace('/measurements');
          }}
        />
        <LinkText
          title="Skip for now"
          onPress={() => {
            skipBody();
            finish();
          }}
        />
      </View>
      {round > 1 ? (
        <>
          <Spacer size={spacing.md} />
          <Button title="Back" variant="ghost" onPress={() => setRound((round - 1) as Round)} disabled={submit.isPending} />
        </>
      ) : null}
    </Screen>
  );
}
