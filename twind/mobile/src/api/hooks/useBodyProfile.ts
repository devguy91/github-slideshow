import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { api, ApiError, type QueryParams } from '../client';
import type { BodyProfile, BodyProfileInput, MatchCount } from '../types';
import { keys } from './keys';

export function useBodyProfile(enabled = true) {
  return useQuery({
    queryKey: keys.body,
    queryFn: () => api.get<BodyProfile>('/me/body'),
    enabled,
    // A brand-new user has no body profile yet; treat 404 as "none" rather than an error loop.
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 2,
  });
}

/** PUT /me/body is a partial upsert: only sent fields change. */
export function useUpdateBodyProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: BodyProfileInput) => api.put<BodyProfile>('/me/body', input),
    onSuccess: (profile) => {
      qc.setQueryData(keys.body, profile);
      void qc.invalidateQueries({ queryKey: keys.feed });
      void qc.invalidateQueries({ queryKey: keys.twins });
    },
  });
}

/** Flatten a BodyProfileInput into query params (source_per_field is not sent). */
export function bodyInputToQuery(input: BodyProfileInput): QueryParams {
  const { source_per_field: _ignored, ...rest } = input;
  const q: QueryParams = {};
  for (const [k, v] of Object.entries(rest)) {
    if (v !== undefined && v !== null && v !== '') q[k] = v as string | number;
  }
  return q;
}

/** Debounce any value. */
export function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

/**
 * Live "N items match you" for the measurement form. The caller passes the current
 * (possibly half-typed) input; we debounce, then hit GET /me/body/match-count.
 */
export function useMatchCount(input: BodyProfileInput, delayMs = 400) {
  const serialized = JSON.stringify(bodyInputToQuery(input));
  const debouncedSerialized = useDebounced(serialized, delayMs);
  const params = useMemo(() => JSON.parse(debouncedSerialized) as QueryParams, [debouncedSerialized]);
  const query = useQuery({
    queryKey: keys.matchCount(params),
    queryFn: () => api.get<MatchCount>('/me/body/match-count', params),
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  });
  return { ...query, isSettling: serialized !== debouncedSerialized };
}
