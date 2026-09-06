import React from 'react';
import { Link } from 'expo-router';
import { EmptyState, Screen } from '@/components';
import { T } from '@/components/ui';

export default function NotFound() {
  return (
    <Screen scroll={false}>
      <EmptyState
        title="Nothing here"
        body="That link doesn't point at anything in Twind."
        action={
          <Link href="/(tabs)">
            <T v="label">Back to the feed</T>
          </Link>
        }
      />
    </Screen>
  );
}
