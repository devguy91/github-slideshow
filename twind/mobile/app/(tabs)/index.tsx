import React, { useCallback } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useBodyProfile, useFeed } from '@/api/hooks';
import { errorMessage } from '@/api/client';
import type { FeedCard } from '@/api/types';
import { Button, EmptyState, ErrorState, FeedCardView, Loading, PrecisionBanner, T } from '@/components';
import { colors, spacing } from '@/theme';

export default function Feed() {
  const router = useRouter();
  const feed = useFeed();
  const body = useBodyProfile();

  const renderItem = useCallback(({ item }: { item: FeedCard }) => (
    <View style={styles.item}>
      <FeedCardView card={item} />
    </View>
  ), []);

  if (feed.isPending) return <Loading label="Finding your matches" />;
  if (feed.isError) return <ErrorState message={errorMessage(feed.error)} onRetry={() => void feed.refetch()} />;

  const header = (
    <View>
      {body.data && body.data.next_unlock ? (
        <View style={styles.banner}>
          <PrecisionBanner profile={body.data} />
        </View>
      ) : null}
      {feed.twins.length > 0 ? (
        <View style={styles.twins}>
          <View style={styles.twinsHeader}>
            <T v="h3">Your twins</T>
            <T v="small">People built like you are selling these</T>
          </View>
          <FlatList
            horizontal
            data={feed.twins}
            keyExtractor={(c) => `twin-${c.listing.id}`}
            renderItem={({ item }) => <FeedCardView card={item} compact />}
            contentContainerStyle={styles.twinsList}
            ItemSeparatorComponent={() => <View style={{ width: spacing.sm }} />}
            showsHorizontalScrollIndicator={false}
          />
        </View>
      ) : null}
      {feed.items.length > 0 ? (
        <T v="h3" style={styles.sectionTitle}>
          Ranked for you
        </T>
      ) : null}
    </View>
  );

  return (
    <FlatList
      data={feed.items}
      keyExtractor={(c) => c.listing.id}
      renderItem={renderItem}
      ListHeaderComponent={header}
      contentContainerStyle={styles.list}
      onEndReached={() => {
        if (feed.hasNextPage && !feed.isFetchingNextPage) void feed.fetchNextPage();
      }}
      onEndReachedThreshold={0.6}
      refreshControl={<RefreshControl refreshing={feed.isRefetching && !feed.isFetchingNextPage} onRefresh={() => void feed.refetch()} tintColor={colors.primary} />}
      ListFooterComponent={feed.isFetchingNextPage ? <Loading /> : <View style={{ height: spacing.xxl }} />}
      ListEmptyComponent={
        <EmptyState
          title="Nothing to show yet"
          body="Your size group is still filling up. Add a measurement or two so we can rank items the moment they land."
          action={<Button title="Add measurements" variant="secondary" onPress={() => router.push('/measurements')} small />}
        />
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, flexGrow: 1 },
  banner: { marginBottom: spacing.lg },
  twins: { marginBottom: spacing.lg },
  twinsHeader: { marginBottom: spacing.sm },
  twinsList: { paddingVertical: spacing.xs },
  sectionTitle: { marginBottom: spacing.sm },
  item: { marginBottom: spacing.lg },
});
