import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../client';
import type { CreateOrderResponse, FitRating, FitRatingInput, Listing, Order, OrderRole, Quote } from '../types';
import { keys } from './keys';

export function useQuote(listingId: string | undefined) {
  return useQuery({
    queryKey: keys.quote(listingId ?? ''),
    queryFn: () => api.post<Quote>('/orders/quote', { listing_id: listingId }),
    enabled: !!listingId,
    staleTime: 60_000,
  });
}

export function useCreateOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (listingId: string) => api.post<CreateOrderResponse>('/orders', { listing_id: listingId }),
    onSuccess: (res) => {
      qc.setQueryData(keys.order(res.order.id), res.order);
      void qc.invalidateQueries({ queryKey: keys.orders('buyer') });
    },
  });
}

export function useOrders(role: OrderRole, enabled = true) {
  return useQuery({
    queryKey: keys.orders(role),
    queryFn: () => api.get<Order[]>('/me/orders', { role }),
    enabled,
  });
}

export function useOrder(id: string | undefined) {
  return useQuery({
    queryKey: keys.order(id ?? ''),
    queryFn: () => api.get<Order>(`/orders/${id ?? ''}`),
    enabled: !!id,
  });
}

function useOrderAction<TBody = void>(path: (id: string) => string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body?: TBody }) => api.post<Order>(path(id), body),
    onSuccess: (order) => {
      qc.setQueryData(keys.order(order.id), order);
      void qc.invalidateQueries({ queryKey: keys.orders('buyer') });
      void qc.invalidateQueries({ queryKey: keys.orders('seller') });
    },
  });
}

export const useShipOrder = () => useOrderAction<{ tracking_ref?: string }>((id) => `/orders/${id}/ship`);
export const useDeliverOrder = () => useOrderAction((id) => `/orders/${id}/deliver`);
export const useRefundOrder = () => useOrderAction((id) => `/orders/${id}/refund`);

export function useRelistOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<Listing>(`/orders/${id}/relist`),
    onSuccess: (listing) => {
      qc.setQueryData(keys.listing(listing.id), listing);
      void qc.invalidateQueries({ queryKey: keys.myListings });
    },
  });
}

/** Private fit rating. Never surfaces publicly. */
export function useFitRating() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, input }: { orderId: string; input: FitRatingInput }) =>
      api.post<FitRating>(`/orders/${orderId}/fit-rating`, input),
    onSuccess: (_rating, { orderId }) => {
      void qc.invalidateQueries({ queryKey: keys.order(orderId) });
      void qc.invalidateQueries({ queryKey: keys.orders('buyer') });
      void qc.invalidateQueries({ queryKey: keys.twins });
      void qc.invalidateQueries({ queryKey: keys.feed });
    },
  });
}
