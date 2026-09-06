/**
 * Small tag explaining why an item is in the feed: "twin" or "following".
 * Plain "match" renders nothing at all.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { MatchReason } from '../api/types';
import { colors, radius } from '../theme';

export function ReasonTag({ reason }: { reason: MatchReason | undefined }) {
  if (!reason || reason === 'match') return null;
  const isTwin = reason === 'twin';
  return (
    <View style={[styles.tag, { backgroundColor: isTwin ? colors.twinBg : colors.followingBg }]}>
      <Text style={[styles.text, { color: isTwin ? colors.twin : colors.following }]}>
        {isTwin ? 'twin' : 'following'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  text: { fontSize: 11, fontWeight: '600', letterSpacing: 0.3 },
});
