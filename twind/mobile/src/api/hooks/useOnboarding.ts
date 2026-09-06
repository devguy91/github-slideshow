import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../client';
import type {
  BodyProfile,
  HeightSizeResponse,
  PickerRound,
  SliceStatus,
  StyleVectorResponse,
  WaitlistInput,
  WaitlistResponse,
} from '../types';
import { keys } from './keys';

export function usePickerRound(kind: 'body' | 'style', round: number) {
  return useQuery({
    queryKey: keys.picker(kind, round),
    queryFn: () => api.get<PickerRound>(`/onboarding/${kind}-picker/${round}`),
    staleTime: 5 * 60_000,
  });
}

export function useSubmitHeightSize() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { height_cm: number; usual_size: string }) =>
      api.post<HeightSizeResponse>('/me/onboarding/height-size', body),
    onSuccess: (res) => {
      const { slice: _slice, ...profile } = res;
      qc.setQueryData(keys.body, profile as BodyProfile);
      void qc.invalidateQueries({ queryKey: keys.me });
    },
  });
}

export function useSubmitBodyPick() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { round: 1 | 2 | 3; choice: 0 | 1 | 2 }) =>
      api.post<BodyProfile>('/me/onboarding/body-picker', body),
    onSuccess: (profile) => qc.setQueryData(keys.body, profile),
  });
}

export function useSubmitStylePick() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { round: 1 | 2 | 3 | 4; choice: 0 | 1 | 2 }) =>
      api.post<StyleVectorResponse>('/me/onboarding/style-picker', body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.feed }),
  });
}

export function useSliceStatus(heightCm: number | null, usualSize: string | null) {
  return useQuery({
    queryKey: keys.slice(heightCm, usualSize),
    queryFn: () =>
      api.get<SliceStatus>('/slices/resolve', { height_cm: heightCm, usual_size: usualSize }, { anonymous: true }),
    enabled: heightCm !== null && !!usualSize,
  });
}

export function useJoinWaitlist() {
  return useMutation({
    mutationFn: (body: WaitlistInput) => api.post<WaitlistResponse>('/waitlist', body, { anonymous: true }),
  });
}
