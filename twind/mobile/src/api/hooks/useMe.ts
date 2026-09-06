import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../client';
import type { PublicProfile, SellerAccuracy, TwinsResponse, User, UserPatch } from '../types';
import { keys } from './keys';

export function useMe(enabled = true) {
  return useQuery({ queryKey: keys.me, queryFn: () => api.get<User>('/me'), enabled });
}

export function useUpdateMe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: UserPatch) => api.patch<User>('/me', patch),
    onSuccess: (user) => qc.setQueryData(keys.me, user),
  });
}

export function usePublicProfile(handle: string | undefined) {
  return useQuery({
    queryKey: keys.publicProfile(handle ?? ''),
    queryFn: () => api.get<PublicProfile>(`/users/${encodeURIComponent(handle ?? '')}`),
    enabled: !!handle,
  });
}

export function useTwins() {
  return useQuery({ queryKey: keys.twins, queryFn: () => api.get<TwinsResponse>('/me/twins') });
}

export function useFollowing() {
  return useQuery({ queryKey: keys.following, queryFn: () => api.get<PublicProfile[]>('/me/following') });
}

export function useFollow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, follow }: { userId: string; follow: boolean }) =>
      follow ? api.post<void>(`/users/${userId}/follow`) : api.delete<void>(`/users/${userId}/follow`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.following });
      void qc.invalidateQueries({ queryKey: keys.feed });
    },
  });
}

export function useSellerAccuracy(enabled = true) {
  return useQuery({
    queryKey: keys.accuracy,
    queryFn: () => api.get<SellerAccuracy>('/me/accuracy'),
    enabled,
  });
}
