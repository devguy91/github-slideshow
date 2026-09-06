import React, { useState } from 'react';
import { Alert, Dimensions, Image, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useBodyProfile, useFollow, useFollowing, useListing, useMe, usePublishListing, useRemoveListing } from '@/api/hooks';
import { errorMessage } from '@/api/client';
import { REQUIRED_LISTING_FIELDS, type ListingMeasurementField } from '@/api/types';
import { Banner, Button, Card, Divider, ErrorState, ImagePlaceholder, Loading, ReasonTag, Row, Screen, ScoreBadge, Spacer, T } from '@/components';
import { CATEGORY_LABELS, fieldLabel, formatCm, formatDate, formatPence } from '@/lib/format';
import { colors, radius, spacing } from '@/theme';

const WIDTH = Dimensions.get('window').width;
const ALL_FIELDS: ListingMeasurementField[] = ['outseam_cm', 'inseam_cm', 'rise_cm', 'waist_flat_cm', 'hip_flat_cm', 'pit_to_pit_cm', 'shoulder_flat_cm', 'length_cm'];

/** Body fields the fit engine can use per category; drives the "N of M measurements" phrase. */
const BODY_FIELDS_BY_CATEGORY: Record<string, number> = { bottoms: 5, tops: 3, dresses: 4 };

export default function ListingDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const listing = useListing(id);
  const me = useMe();
  const body = useBodyProfile();
  const following = useFollowing();
  const follow = useFollow();
  const publish = usePublishListing();
  const remove = useRemoveListing();
  const [page, setPage] = useState(0);

  if (listing.isPending) return <Loading />;
  if (listing.isError) return <ErrorState message={errorMessage(listing.error)} onRetry={() => void listing.refetch()} />;
  const item = listing.data;
  const isMine = me.data?.id === item.seller.id;
  const isFollowing = following.data?.some((p) => p.id === item.seller.id) ?? false;
  const match = item.match;
  const purchasable = item.status === 'live' && !isMine;
  const measured = ALL_FIELDS.filter((f) => item.measurements[f] != null);
  const required = REQUIRED_LISTING_FIELDS[item.category];

  async function onPublish() {
    try {
      await publish.mutateAsync(item.id);
    } catch (e) {
      Alert.alert('Could not publish', errorMessage(e));
    }
  }
  function onRemove() {
    Alert.alert('Remove listing?', 'It will disappear from the feed.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          remove.mutate(item.id, { onSuccess: () => router.back(), onError: (e) => Alert.alert('Could not remove', errorMessage(e)) });
        },
      },
    ]);
  }

  return (
    <Screen padded={false}>
      <View>
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / WIDTH))}
        >
          {item.photos.length > 0 ? (
            item.photos.map((p, i) => (
              <View key={`${p.url}-${i}`} style={styles.photo}>
                <Image source={{ uri: p.url }} style={styles.photoImg} resizeMode="cover" />
                {p.is_modelled_fit ? (
                  <View style={styles.wornTag}>
                    <T v="caption" color={colors.surface}>
                      worn
                    </T>
                  </View>
                ) : null}
              </View>
            ))
          ) : (
            <ImagePlaceholder style={styles.photo} />
          )}
        </ScrollView>
        {item.photos.length > 1 ? (
          <View style={styles.dots}>
            {item.photos.map((_, i) => (
              <View key={i} style={[styles.dot, i === page && styles.dotActive]} />
            ))}
          </View>
        ) : null}
      </View>

      <View style={styles.content}>
        <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>
            <T v="h2">{item.title}</T>
            <T v="bodyMuted">{[item.brand, CATEGORY_LABELS[item.category], item.size_label].filter(Boolean).join(' · ')}</T>
          </View>
          <T v="h2">{formatPence(item.price_pence)}</T>
        </Row>

        <Spacer size={spacing.md} />
        {match ? (
          <Card>
            <Row style={{ justifyContent: 'space-between' }}>
              <T v="label">How it fits you</T>
              <ReasonTag reason={match.reason} />
            </Row>
            <Spacer size={spacing.sm} />
            <Row gap={spacing.md} style={{ alignItems: 'flex-start' }}>
              <ScoreBadge
                kind="fit"
                score={match.fit_score}
                confidence={match.fit_confidence}
                fieldsUsed={match.fields_used}
                totalFields={BODY_FIELDS_BY_CATEGORY[item.category]}
                size="lg"
              />
              <ScoreBadge kind="style" score={match.style_score} size="lg" />
            </Row>
            {match.fields_used.length > 0 ? (
              <T v="small" style={{ marginTop: spacing.sm }}>
                Compared on {match.fields_used.map(fieldLabel).join(', ').toLowerCase()}.
              </T>
            ) : null}
            {body.data?.next_unlock ? (
              <Button title="Sharpen your fit score" variant="ghost" small style={{ marginTop: spacing.md }} onPress={() => router.push('/measurements')} />
            ) : null}
          </Card>
        ) : (
          <Banner>Add your measurements to see how this would fit you.</Banner>
        )}

        <Spacer size={spacing.xl} />
        <T v="h3">Garment measurements</T>
        <T v="small">Measured flat by the seller, in centimetres.</T>
        <Spacer size={spacing.sm} />
        <Card>
          {measured.length === 0 ? (
            <T v="small">No measurements yet.</T>
          ) : (
            measured.map((f, i) => (
              <View key={f}>
                {i > 0 ? <Divider /> : null}
                <Row style={{ justifyContent: 'space-between' }}>
                  <T v="bodyMuted">{fieldLabel(f)}</T>
                  <T v="label">{formatCm(item.measurements[f])}</T>
                </Row>
              </View>
            ))
          )}
          {isMine && item.status === 'draft' && required.some((f) => item.measurements[f] == null) ? (
            <>
              <Spacer size={spacing.sm} />
              <Banner tone="warning">
                Missing: {required.filter((f) => item.measurements[f] == null).map(fieldLabel).join(', ')}. Add them to publish.
              </Banner>
            </>
          ) : null}
        </Card>

        {item.description ? (
          <>
            <Spacer size={spacing.xl} />
            <T v="h3">About this item</T>
            <Spacer size={spacing.xs} />
            <T v="body">{item.description}</T>
          </>
        ) : null}

        <Spacer size={spacing.xl} />
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <Row gap={spacing.md}>
              {item.seller.avatar_url ? <Image source={{ uri: item.seller.avatar_url }} style={styles.avatar} /> : <ImagePlaceholder style={styles.avatar} />}
              <View>
                <T v="label">{item.seller.display_name ?? item.seller.handle ?? 'Seller'}</T>
                <T v="small">
                  {item.seller.listing_count} listings · {item.seller.twin_count} twins{item.seller.accuracy_badge ? ' · accurate fit' : ''}
                </T>
              </View>
            </Row>
            {!isMine ? (
              <Button
                title={isFollowing ? 'Following' : 'Follow'}
                variant={isFollowing ? 'secondary' : 'ghost'}
                small
                loading={follow.isPending}
                onPress={() => follow.mutate({ userId: item.seller.id, follow: !isFollowing })}
              />
            ) : null}
          </Row>
        </Card>

        <Spacer size={spacing.xl} />
        {isMine ? (
          <>
            {item.status === 'draft' ? <Button title="Publish" onPress={() => void onPublish()} loading={publish.isPending} /> : null}
            <Spacer size={spacing.sm} />
            {item.status !== 'removed' && item.status !== 'sold' ? <Button title="Remove listing" variant="danger" onPress={onRemove} loading={remove.isPending} /> : null}
          </>
        ) : purchasable ? (
          <Button title={`Buy for ${formatPence(item.price_pence)}`} onPress={() => router.push(`/checkout/${item.id}`)} />
        ) : (
          <Banner>{item.status === 'sold' ? 'This item has sold.' : 'This item is no longer available.'}</Banner>
        )}
        <Spacer size={spacing.sm} />
        <T v="caption" center>
          Listed {formatDate(item.created_at)}
        </T>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  photo: { width: WIDTH, aspectRatio: 3 / 4, backgroundColor: colors.surfaceAlt, borderRadius: 0 },
  photoImg: { width: '100%', height: '100%' },
  wornTag: { position: 'absolute', left: spacing.md, bottom: spacing.md, backgroundColor: 'rgba(31,26,23,0.75)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: spacing.sm },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.border },
  dotActive: { backgroundColor: colors.text },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  avatar: { width: 40, height: 40, borderRadius: 20 },
});
