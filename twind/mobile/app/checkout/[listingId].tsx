import React, { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCreateOrder, useListing, useQuote } from '@/api/hooks';
import { ApiError, errorMessage } from '@/api/client';
import { Banner, Button, Card, Divider, ErrorState, ImagePlaceholder, Loading, Row, Screen, Spacer, T } from '@/components';
import { FEE_LINE_LABELS } from '@/lib/fees';
import { formatPence } from '@/lib/format';
import { usePaymentSheet } from '@/lib/stripe';
import { colors, radius, spacing } from '@/theme';

export default function Checkout() {
  const { listingId } = useLocalSearchParams<{ listingId: string }>();
  const router = useRouter();
  const listing = useListing(listingId);
  const quote = useQuote(listingId);
  const createOrder = useCreateOrder();
  const { pay, paymentsEnabled } = usePaymentSheet();
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);

  if (listing.isPending || quote.isPending) return <Loading label="Getting your price" />;
  if (listing.isError) return <ErrorState message={errorMessage(listing.error)} onRetry={() => void listing.refetch()} />;
  if (quote.isError) {
    const notPurchasable = quote.error instanceof ApiError && quote.error.isNotPurchasable;
    return <ErrorState message={notPurchasable ? 'This item is no longer available to buy.' : errorMessage(quote.error)} onRetry={notPurchasable ? undefined : () => void quote.refetch()} />;
  }
  const item = listing.data;
  const q = quote.data;
  const photo = item.photos[0]?.url;

  async function onBuy() {
    if (!listingId) return;
    setError(null);
    setPaying(true);
    try {
      const res = await createOrder.mutateAsync(listingId);
      const outcome = await pay(res.payment.client_secret, { merchantDisplayName: 'Twind' });
      if (outcome.status === 'paid') {
        router.replace(`/orders/${res.order.id}`);
      } else if (outcome.status === 'disabled') {
        router.replace({ pathname: '/orders/[id]', params: { id: res.order.id, unpaid: '1' } });
      } else if (outcome.status === 'error') {
        setError(outcome.message);
      }
      // cancelled: stay on the page, order remains pending server-side
    } catch (e) {
      if (e instanceof ApiError && e.isNotPurchasable) setError('Sorry, someone else just bought this.');
      else setError(errorMessage(e));
    } finally {
      setPaying(false);
    }
  }

  return (
    <Screen>
      <Row gap={spacing.md}>
        {photo ? <Image source={{ uri: photo }} style={styles.thumb} /> : <ImagePlaceholder style={styles.thumb} />}
        <View style={{ flex: 1 }}>
          <T v="h3" numberOfLines={2}>
            {item.title}
          </T>
          <T v="small">
            {[item.brand, item.size_label].filter(Boolean).join(' · ')}
          </T>
          <T v="small">Sold by {item.seller.display_name ?? item.seller.handle ?? 'seller'}</T>
        </View>
      </Row>

      <Spacer size={spacing.xl} />
      <Card>
        <Line label={FEE_LINE_LABELS.item} value={formatPence(q.item_pence)} />
        <Divider />
        <Line
          label={FEE_LINE_LABELS.protection}
          value={q.protection_fee_waived ? 'Waived' : formatPence(q.protection_fee_pence)}
          valueColor={q.protection_fee_waived ? colors.success : undefined}
          sub={q.protection_fee_waived ? q.waived_reason ?? 'No protection fee on this order.' : 'Covers you if the fit is not as described.'}
        />
        <Divider />
        <Line label={FEE_LINE_LABELS.shipping} value={formatPence(q.shipping_pence, { free: 'Free' })} />
        <Divider />
        <Line label={FEE_LINE_LABELS.total} value={formatPence(q.total_pence)} bold />
      </Card>

      <Spacer size={spacing.lg} />
      <Banner>
        Your money is held until you confirm delivery and tell us privately whether it fit. If it didn't, you can get a refund or relist in one tap.
      </Banner>

      {!paymentsEnabled ? (
        <>
          <Spacer size={spacing.md} />
          <Banner tone="warning">
            Payments are disabled in this build (no Stripe key). Placing the order creates it as pending so you can test the rest of the flow.
          </Banner>
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
      <Button title={paymentsEnabled ? `Pay ${formatPence(q.total_pence)}` : 'Place order (test)'} onPress={() => void onBuy()} loading={paying} />
    </Screen>
  );
}

function Line({ label, value, sub, bold, valueColor }: { label: string; value: string; sub?: string; bold?: boolean; valueColor?: string }) {
  return (
    <View>
      <Row style={{ justifyContent: 'space-between' }}>
        <T v={bold ? 'h3' : 'body'}>{label}</T>
        <T v={bold ? 'h3' : 'body'} color={valueColor}>
          {value}
        </T>
      </Row>
      {sub ? <T v="small">{sub}</T> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  thumb: { width: 72, height: 90, borderRadius: radius.md },
});
