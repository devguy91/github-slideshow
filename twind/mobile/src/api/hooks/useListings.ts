import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../client';
import type { Listing, ListingInput, SignedUpload } from '../types';
import { keys } from './keys';

export function useListing(id: string | undefined) {
  return useQuery({
    queryKey: keys.listing(id ?? ''),
    queryFn: () => api.get<Listing>(`/listings/${id ?? ''}`),
    enabled: !!id,
  });
}

export function useMyListings(enabled = true) {
  return useQuery({ queryKey: keys.myListings, queryFn: () => api.get<Listing[]>('/me/listings'), enabled });
}

export function useUserListings(handle: string | undefined) {
  return useQuery({
    queryKey: keys.userListings(handle ?? ''),
    queryFn: () => api.get<Listing[]>(`/users/${encodeURIComponent(handle ?? '')}/listings`),
    enabled: !!handle,
  });
}

export function useCreateListing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ListingInput) => api.post<Listing>('/listings', input),
    onSuccess: (listing) => {
      qc.setQueryData(keys.listing(listing.id), listing);
      void qc.invalidateQueries({ queryKey: keys.myListings });
    },
  });
}

export function useUpdateListing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<ListingInput> }) =>
      api.patch<Listing>(`/listings/${id}`, patch),
    onSuccess: (listing) => {
      qc.setQueryData(keys.listing(listing.id), listing);
      void qc.invalidateQueries({ queryKey: keys.myListings });
    },
  });
}

/** Server validates required measurement fields for the category (422 on failure). */
export function usePublishListing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<Listing>(`/listings/${id}/publish`),
    onSuccess: (listing) => {
      qc.setQueryData(keys.listing(listing.id), listing);
      void qc.invalidateQueries({ queryKey: keys.myListings });
      void qc.invalidateQueries({ queryKey: keys.feed });
    },
  });
}

export function useRemoveListing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<Listing>(`/listings/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.myListings });
      void qc.invalidateQueries({ queryKey: keys.feed });
    },
  });
}

/**
 * Upload a local image: sign, then PUT the bytes to the presigned URL.
 * Returns the public URL to store on the listing.
 */
export async function uploadImage(localUri: string, contentType = 'image/jpeg'): Promise<string> {
  const signed = await api.post<SignedUpload>('/uploads/sign', { content_type: contentType });
  const fileRes = await fetch(localUri);
  const blob = await fileRes.blob();
  const put = await fetch(signed.upload_url, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: blob,
  });
  if (!put.ok) throw new Error(`Upload failed (${put.status})`);
  return signed.public_url;
}

export function useUploadImage() {
  return useMutation({ mutationFn: (localUri: string) => uploadImage(localUri) });
}
