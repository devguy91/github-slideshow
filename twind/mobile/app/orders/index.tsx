import React, { useState } from 'react';
import { FlatList, Image, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useOrders } from '@/api/hooks';
import { errorMessage } from '@/api/client';
import type { Order, OrderRole } from '@/api/types';
import { Chip, EmptyState, ErrorState, ImagePlaceholder, Loading, T } from '@/components';
import { formatDate, formatPence, ORDER_STATUS_LABELS } from '@/lib/format';
import { colors, radius, spacing } from '@/theme';

export default function Orders() {
  const router = useRouter();
  const [role, setRole] = useState<OrderRole>('buyer');
  const orders = useOrders(role);

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.tabs}>
        <Chip label="Bought" selected={role === 'buyer'} onPress={() => setRole('buyer')} />
        <Chip label="Sold" selected={role === 'seller'} onPress={() => setRole('seller')} />
      </View>
      {orders.isPending ? (
        <Loading />
      ) : orders.isError ? (
        <ErrorState message={errorMessage(orders.error)} onRetry={() => void orders.refetch()} />
      ) : (
        <FlatList
          data={orders.data}
          keyExtractor={(o) => o.id}
          contentContainerStyle={styles.list}
          refreshing={orders.isRefetching}
          onRefresh={() => void orders.refetch()}
          renderItem={({ item }) => <OrderRow order={item} role={role} onPress={() => router.push(`/orders/${item.id}`)} />}
          ListEmptyComponent={<EmptyState title={role === 'buyer' ? 'No purchases yet' : 'No sales yet'} body={role === 'buyer' ? 'Items you buy will show up here.' : 'When something sells, manage shipping from here.'} />}
        />
      )}
    </View>
  );
}

function OrderRow({ order, role, onPress }: { order: Order; role: OrderRole; onPress: () => void }) {
  const photo = order.listing.photos[0]?.url;
  const needsRating = role === 'buyer' && order.status === 'delivered' && !order.fit_rating;
  return (
    <Pressable onPress={onPress} style={styles.row} accessibilityRole="button">
      {photo ? <Image source={{ uri: photo }} style={styles.thumb} /> : <ImagePlaceholder style={styles.thumb} />}
      <View style={{ flex: 1 }}>
        <T v="label" numberOfLines={1}>
          {order.listing.title}
        </T>
        <T v="small">
          {formatPence(order.amount_pence)} · {formatDate(order.created_at)}
        </T>
        <T v="small" color={needsRating ? colors.primaryDark : colors.textMuted}>
          {needsRating ? 'Tell us if it fit' : ORDER_STATUS_LABELS[order.status] ?? order.status}
        </T>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', gap: spacing.sm, padding: spacing.lg, paddingBottom: spacing.sm },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, flexGrow: 1 },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  thumb: { width: 56, height: 70, borderRadius: radius.sm },
});
