import { useInfiniteQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { api } from '../client';
import type { FeedCard, FeedPage } from '../types';
import { keys } from './keys';

const PAGE_SIZE = 20;

/**
 * GET /feed?cursor=&limit= -> { twins, items, next_cursor }.
 * `twins` is only meaningful on the first page; `items` accumulate across pages.
 */
export function useFeed(enabled = true) {
  const query = useInfiniteQuery({
    queryKey: keys.feed,
    queryFn: ({ pageParam }) =>
      api.get<FeedPage>('/feed', { cursor: pageParam || undefined, limit: PAGE_SIZE }),
    initialPageParam: '',
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    enabled,
  });

  const twins: FeedCard[] = useMemo(() => query.data?.pages[0]?.twins ?? [], [query.data]);
  const items: FeedCard[] = useMemo(() => {
    const seen = new Set<string>();
    const out: FeedCard[] = [];
    for (const page of query.data?.pages ?? []) {
      for (const card of page.items) {
        if (seen.has(card.listing.id)) continue;
        seen.add(card.listing.id);
        out.push(card);
      }
    }
    return out;
  }, [query.data]);

  return { ...query, twins, items };
}
