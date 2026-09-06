/** Centralised query keys so invalidation is consistent across hooks. */
export const keys = {
  me: ['me'] as const,
  body: ['me', 'body'] as const,
  matchCount: (params: Record<string, unknown>) => ['me', 'body', 'match-count', params] as const,
  accuracy: ['me', 'accuracy'] as const,
  twins: ['me', 'twins'] as const,
  following: ['me', 'following'] as const,
  feed: ['feed'] as const,
  listing: (id: string) => ['listings', id] as const,
  myListings: ['me', 'listings'] as const,
  userListings: (handle: string) => ['users', handle, 'listings'] as const,
  publicProfile: (handle: string) => ['users', handle] as const,
  orders: (role: 'buyer' | 'seller') => ['me', 'orders', role] as const,
  order: (id: string) => ['orders', id] as const,
  quote: (listingId: string) => ['orders', 'quote', listingId] as const,
  picker: (kind: 'body' | 'style', round: number) => ['onboarding', kind, round] as const,
  slice: (heightCm: number | null, usualSize: string | null) => ['slices', heightCm, usualSize] as const,
};
