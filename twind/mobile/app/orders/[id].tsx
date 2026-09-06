import React, { useState } from 'react';
import { Alert, Image, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useDeliverOrder, useMe, useOrder, useRefundOrder, useRelistOrder, useShipOrder } from '@/api/hooks';
import { errorMessage } from '@/api/client';
import { Banner, Button, Card, Divider, ErrorState, ImagePlaceholder, Loading, Row, Screen, Spacer, T, TextField } from '@/components';
import { formatDateTime, formatPence, ISSUE_LABELS, ORDER_STATUS_LABELS } from '@/lib/format';
import { colors, radius, spacing } from '@/theme';

const STEPS = ['paid', 'shipped', 'delivered', 'released'] as const;

export default function OrderDetail() {
  const { id, unpaid } = useLocalSearchParams<{ id: string; unpaid?: string }>();
  const router = useRouter();
  const order = useOrder(id);
  const me = useMe();
  const ship = useShipOrder();
  const deliver = useDeliverOrder();
  const refund = useRefundOrder();
  const relist = useRelistOrder();
  const [tracking, setTracking] = useState('');

  if (order.isPending) return <Loading />;
  if (order.isError) return <ErrorState message={errorMessage(order.error)} onRetry={() => void order.refetch()} />;
  const o = order.data;
  const isBuyer = me.data?.id === o.buyer_id;
  const isSeller = me.data?.id === o.seller_id;
  const photo = o.listing.photos[0]?.url;
  const stepIndex = STEPS.indexOf(o.status as (typeof STEPS)[number]);
  const total = o.amount_pence + o.protection_fee_pence + o.shipping_pence;

  const fail = (title: string) => (e: unknown) => Alert.alert(title, errorMessage(e));

  return (
    <Screen>
      {unpaid === '1' && o.status === 'pending' ? (
        <>
          <Banner tone="warning">Order created but not paid: this build has no Stripe key, so the payment sheet was skipped.</Banner>
          <Spacer size={spacing.md} />
        </>
      ) : null}

      <Row gap={spacing.md}>
        {photo ? <Image source={{ uri: photo }} style={styles.thumb} /> : <ImagePlaceholder style={styles.thumb} />}
        <View style={{ flex: 1 }}>
          <T v="h3" numberOfLines={2}>
            {o.listing.title}
          </T>
          <T v="small">{[o.listing.brand, o.listing.size_label].filter(Boolean).join(' · ')}</T>
          <T v="small">{isBuyer ? `Bought from ${o.listing.seller.display_name ?? o.listing.seller.handle ?? 'seller'}` : 'Sold by you'}</T>
        </View>
      </Row>

      <Spacer size={spacing.xl} />
      <Card>
        <T v="label">{ORDER_STATUS_LABELS[o.status] ?? o.status}</T>
        {o.status !== 'refunded' && o.status !== 'pending' ? (
          <View style={styles.steps}>
            {STEPS.map((s, i) => (
              <View key={s} style={styles.step}>
                <View style={[styles.stepDot, i <= stepIndex && styles.stepDotOn]} />
                <T v="caption" color={i <= stepIndex ? colors.text : colors.textFaint}>
                  {s}
                </T>
              </View>
            ))}
          </View>
        ) : null}
        {o.auto_release_at && (o.status === 'delivered' || o.status === 'shipped') ? (
          <T v="small" style={{ marginTop: spacing.sm }}>
            Payment releases to the seller automatically at {formatDateTime(o.auto_release_at)} unless you report a fit problem.
          </T>
        ) : null}
      </Card>

      <Spacer size={spacing.lg} />
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <T v="bodyMuted">Item</T>
          <T v="body">{formatPence(o.amount_pence)}</T>
        </Row>
        <Divider />
        <Row style={{ justifyContent: 'space-between' }}>
          <T v="bodyMuted">Buyer protection</T>
          <T v="body">{formatPence(o.protection_fee_pence, { free: 'Waived' })}</T>
        </Row>
        <Divider />
        <Row style={{ justifyContent: 'space-between' }}>
          <T v="bodyMuted">Shipping</T>
          <T v="body">{formatPence(o.shipping_pence, { free: 'Free' })}</T>
        </Row>
        <Divider />
        <Row style={{ justifyContent: 'space-between' }}>
          <T v="h3">Total</T>
          <T v="h3">{formatPence(total)}</T>
        </Row>
      </Card>

      {isBuyer && o.fit_rating ? (
        <>
          <Spacer size={spacing.lg} />
          <Card>
            <T v="label">Your private fit note</T>
            <T v="small" style={{ marginTop: spacing.xs }}>
              {o.fit_rating.fit_as_described ? 'You said it fit as described.' : `You said it didn't fit as described${o.fit_rating.issues.length ? `: ${o.fit_rating.issues.map((i) => ISSUE_LABELS[i] ?? i).join(', ').toLowerCase()}` : ''}.`}
              {' '}Only you and Twind can see this.
            </T>
            {o.fit_rating.became_twins ? (
              <T v="small" style={{ marginTop: spacing.xs, color: colors.twin }}>
                You and this seller are now twins. Their listings will rank higher for you.
              </T>
            ) : null}
          </Card>
        </>
      ) : null}

      <Spacer size={spacing.xl} />
      {isSeller && o.status === 'paid' ? (
        <>
          <TextField label="Tracking reference (optional)" value={tracking} onChangeText={setTracking} autoCapitalize="characters" />
          <Button
            title="Mark as shipped"
            loading={ship.isPending}
            onPress={() => ship.mutate({ id: o.id, body: tracking.trim() ? { tracking_ref: tracking.trim() } : {} }, { onError: fail('Could not update') })}
          />
        </>
      ) : null}

      {isBuyer && o.status === 'shipped' ? (
        <Button title="It's arrived" loading={deliver.isPending} onPress={() => deliver.mutate({ id: o.id }, { onError: fail('Could not update') })} />
      ) : null}

      {isBuyer && o.status === 'delivered' && !o.fit_rating ? (
        <>
          <Button title="Did it fit as described?" onPress={() => router.push(`/fit-rating/${o.id}`)} />
          <Spacer size={spacing.sm} />
          <T v="small" center>
            Your answer is private and is never shown as a review.
          </T>
        </>
      ) : null}

      {isBuyer && o.fit_rating && !o.fit_rating.fit_as_described && o.status === 'delivered' ? (
        <>
          <Button
            title="Request a refund"
            variant="secondary"
            loading={refund.isPending}
            onPress={() =>
              Alert.alert('Request a refund?', 'You will need to send the item back to the seller.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Refund', onPress: () => refund.mutate({ id: o.id }, { onError: fail('Refund failed') }) },
              ])
            }
          />
          <Spacer size={spacing.sm} />
        </>
      ) : null}

      {isBuyer && (o.status === 'delivered' || o.status === 'released') ? (
        <Button
          title="Relist this item"
          variant="ghost"
          loading={relist.isPending}
          onPress={() =>
            relist.mutate(o.id, {
              onSuccess: (listing) => router.push(`/listing/${listing.id}`),
              onError: fail('Could not relist'),
            })
          }
        />
      ) : null}

      <Spacer size={spacing.lg} />
      <T v="caption" center>
        Order {o.id} · {formatDateTime(o.created_at)}
      </T>
    </Screen>
  );
}

const styles = StyleSheet.create({
  thumb: { width: 72, height: 90, borderRadius: radius.md },
  steps: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.md },
  step: { alignItems: 'center', gap: 4, flex: 1 },
  stepDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.border },
  stepDotOn: { backgroundColor: colors.primary },
});
