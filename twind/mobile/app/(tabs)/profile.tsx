import React from 'react';
import { FlatList, Image, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useBodyProfile, useMe, useMyListings, useSellerAccuracy, useTwins } from '@/api/hooks';
import { errorMessage } from '@/api/client';
import { BODY_MEASUREMENT_FIELDS, type Listing } from '@/api/types';
import { Banner, Button, Card, Divider, ErrorState, ImagePlaceholder, Loading, PrecisionBanner, Row, Screen, Spacer, T } from '@/components';
import { fieldLabel, formatCm, formatPence } from '@/lib/format';
import { colors, radius, spacing } from '@/theme';

export default function Profile() {
  const router = useRouter();
  const me = useMe();
  const body = useBodyProfile();
  const twins = useTwins();
  const listings = useMyListings();
  const accuracy = useSellerAccuracy();

  if (me.isPending) return <Loading />;
  if (me.isError) return <ErrorState message={errorMessage(me.error)} onRetry={() => void me.refetch()} />;
  const user = me.data;

  const filled = BODY_MEASUREMENT_FIELDS.filter((f) => body.data?.[f] != null);
  const liveListings = (listings.data ?? []).filter((l) => l.status !== 'removed');

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }}>
        <Row gap={spacing.md}>
          {user.avatar_url ? (
            <Image source={{ uri: user.avatar_url }} style={styles.avatar} />
          ) : (
            <ImagePlaceholder style={styles.avatar} />
          )}
          <View>
            <T v="h2">{user.display_name ?? user.handle ?? 'You'}</T>
            {user.handle ? <T v="small">@{user.handle}</T> : null}
          </View>
        </Row>
        <Button title="Settings" variant="ghost" small onPress={() => router.push('/settings')} />
      </Row>
      {user.is_founding_seller ? (
        <>
          <Spacer size={spacing.md} />
          <Banner tone="success">Founding seller</Banner>
        </>
      ) : null}

      <Spacer size={spacing.xl} />
      <Row gap={spacing.md}>
        <Card style={styles.stat}>
          <T v="h2">{twins.data?.count ?? '—'}</T>
          <T v="small">twins</T>
        </Card>
        <Card style={styles.stat}>
          <T v="h2">{liveListings.length}</T>
          <T v="small">listings</T>
        </Card>
        <Card style={styles.stat}>
          <T v="h2">{accuracy.data?.score != null ? `${Math.round(accuracy.data.score * 100)}%` : '—'}</T>
          <T v="small">fit accuracy</T>
        </Card>
      </Row>
      {accuracy.data?.private_prompt ? (
        <>
          <Spacer size={spacing.md} />
          <Banner tone={accuracy.data.tier === 'needs_attention' ? 'warning' : 'info'}>{accuracy.data.private_prompt}</Banner>
        </>
      ) : null}

      <Spacer size={spacing.xl} />
      <PrecisionBanner profile={body.data} />

      <Spacer size={spacing.xl} />
      <Row style={{ justifyContent: 'space-between' }}>
        <T v="h3">Your measurements</T>
        <Button title={filled.length ? 'Edit' : 'Add'} variant="ghost" small onPress={() => router.push('/measurements')} />
      </Row>
      <Spacer size={spacing.sm} />
      <Card>
        {body.data ? (
          <>
            <Row style={styles.measureRow}>
              <T v="bodyMuted">Usual size</T>
              <T v="label">{body.data.usual_size ?? '—'}</T>
            </Row>
            {BODY_MEASUREMENT_FIELDS.map((f) => {
              const v = body.data?.[f];
              if (v == null) return null;
              const src = body.data?.source_per_field?.[f];
              return (
                <Row key={f} style={styles.measureRow}>
                  <T v="bodyMuted">{fieldLabel(f)}</T>
                  <Row gap={spacing.xs}>
                    <T v="label">{formatCm(v)}</T>
                    {src === 'picker' ? <T v="caption" color={colors.warning}>estimate</T> : null}
                  </Row>
                </Row>
              );
            })}
            {filled.length === 0 ? <T v="small">No measurements yet. Add one to sharpen your fit scores.</T> : null}
          </>
        ) : (
          <T v="small">No measurements yet.</T>
        )}
      </Card>

      <Spacer size={spacing.xl} />
      <Row style={{ justifyContent: 'space-between' }}>
        <T v="h3">Your listings</T>
        <Button title="Orders" variant="ghost" small onPress={() => router.push('/orders')} />
      </Row>
      <Spacer size={spacing.sm} />
      {listings.isPending ? (
        <Loading />
      ) : liveListings.length === 0 ? (
        <Card>
          <T v="small">Nothing listed yet.</T>
          <Spacer size={spacing.sm} />
          <Button title="Sell something" small onPress={() => router.push('/(tabs)/sell')} />
        </Card>
      ) : (
        <FlatList
          data={liveListings}
          scrollEnabled={false}
          keyExtractor={(l) => l.id}
          ItemSeparatorComponent={Divider}
          renderItem={({ item }) => <ListingRow listing={item} onPress={() => router.push(`/listing/${item.id}`)} />}
        />
      )}
    </Screen>
  );
}

function ListingRow({ listing, onPress }: { listing: Listing; onPress: () => void }) {
  const photo = listing.photos[0]?.url;
  return (
    <Pressable onPress={onPress} style={styles.listingRow} accessibilityRole="button">
      {photo ? <Image source={{ uri: photo }} style={styles.thumb} /> : <ImagePlaceholder style={styles.thumb} />}
      <View style={{ flex: 1 }}>
        <T v="label" numberOfLines={1}>
          {listing.title}
        </T>
        <T v="small">
          {listing.size_label} · {formatPence(listing.price_pence)}
        </T>
      </View>
      <View style={[styles.status, listing.status === 'live' ? { backgroundColor: colors.successBg } : null]}>
        <T v="caption" color={listing.status === 'live' ? colors.success : colors.textMuted}>
          {listing.status}
        </T>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  avatar: { width: 56, height: 56, borderRadius: 28 },
  stat: { flex: 1, alignItems: 'center', paddingVertical: spacing.md },
  measureRow: { justifyContent: 'space-between', paddingVertical: 6 },
  listingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xs },
  thumb: { width: 48, height: 60, borderRadius: radius.sm },
  status: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt },
});
