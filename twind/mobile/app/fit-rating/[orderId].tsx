import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFitRating, useOrder } from '@/api/hooks';
import { errorMessage } from '@/api/client';
import { ISSUES, type Issue } from '@/api/types';
import { Banner, Button, Card, Chip, ErrorState, Loading, Row, Screen, Spacer, T } from '@/components';
import { ISSUE_LABELS } from '@/lib/format';
import { colors, spacing } from '@/theme';

export default function FitRatingScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const router = useRouter();
  const order = useOrder(orderId);
  const rate = useFitRating();
  const [fit, setFit] = useState<boolean | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [error, setError] = useState<string | null>(null);

  if (order.isPending) return <Loading />;
  if (order.isError) return <ErrorState message={errorMessage(order.error)} onRetry={() => void order.refetch()} />;

  const existing = order.data.fit_rating;
  const result = rate.data ?? existing;

  function toggleIssue(i: Issue) {
    setIssues((cur) => (cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i]));
  }

  async function submit() {
    if (fit === null || !orderId) return;
    setError(null);
    try {
      await rate.mutateAsync({ orderId, input: fit ? { fit_as_described: true } : { fit_as_described: false, issues } });
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  if (result) {
    return (
      <Screen>
        <T v="h2">Thanks. That's saved privately.</T>
        <Spacer size={spacing.md} />
        <Card>
          <T v="body">{result.fit_as_described ? 'You said it fit as described.' : "You said it didn't fit as described."}</T>
          {result.issues.length > 0 ? (
            <T v="small" style={{ marginTop: spacing.xs }}>
              {result.issues.map((i) => ISSUE_LABELS[i] ?? i).join(', ')}
            </T>
          ) : null}
        </Card>
        {result.became_twins ? (
          <>
            <Spacer size={spacing.md} />
            <Banner tone="success">You and this seller are now twins. Their future listings will rank higher in your feed.</Banner>
          </>
        ) : null}
        {!result.fit_as_described ? (
          <>
            <Spacer size={spacing.md} />
            <Banner>You can request a refund or relist the item from the order page.</Banner>
          </>
        ) : null}
        <Spacer size={spacing.md} />
        <T v="small">
          This answer is private. It is never shown as a public review and the seller only ever sees an aggregate accuracy score.
        </T>
        <View style={{ flex: 1 }} />
        <Button title="Back to order" onPress={() => router.replace(`/orders/${orderId}`)} />
      </Screen>
    );
  }

  return (
    <Screen>
      <T v="h2">Did it fit as described?</T>
      <T v="bodyMuted" style={{ marginTop: spacing.xs }}>
        {order.data.listing.title}
      </T>
      <Spacer size={spacing.md} />
      <Banner>
        This is private. Your answer is never shown as a public review and is never attached to your name. It only tunes your fit scores and the seller's private accuracy score.
      </Banner>

      <Spacer size={spacing.xl} />
      <Row gap={spacing.md}>
        <Button title="Yes, it fit" variant={fit === true ? 'primary' : 'secondary'} style={{ flex: 1 }} onPress={() => { setFit(true); setIssues([]); }} />
        <Button title="No, it didn't" variant={fit === false ? 'primary' : 'secondary'} style={{ flex: 1 }} onPress={() => setFit(false)} />
      </Row>

      {fit === false ? (
        <>
          <Spacer size={spacing.xl} />
          <T v="h3">What was off?</T>
          <T v="small" style={{ marginBottom: spacing.md }}>
            Pick everything that applies.
          </T>
          <View style={styles.chips}>
            {ISSUES.map((i) => (
              <Chip key={i} label={ISSUE_LABELS[i] ?? i} selected={issues.includes(i)} onPress={() => toggleIssue(i)} />
            ))}
          </View>
        </>
      ) : null}

      {error ? (
        <>
          <Spacer size={spacing.md} />
          <Banner tone="danger">{error}</Banner>
        </>
      ) : null}
      <View style={{ flex: 1 }} />
      <Spacer size={spacing.xl} />
      <Button title="Save privately" onPress={() => void submit()} disabled={fit === null || (fit === false && issues.length === 0)} loading={rate.isPending} />
      <Spacer size={spacing.sm} />
      <T v="caption" center color={colors.textMuted}>
        Not a review. Never public.
      </T>
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
