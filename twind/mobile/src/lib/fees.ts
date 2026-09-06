/**
 * DISPLAY-ONLY fee helpers.
 *
 * The server's `POST /orders/quote` is the source of truth for every checkout amount.
 * These helpers exist only to show sellers an indicative "you'll receive about..."
 * line while they type a price, and to label the quote breakdown. Never use them to
 * charge or settle anything.
 */

/** Indicative buyer protection fee: 5% + 50p, capped at £8. Matches marketing copy only. */
export const INDICATIVE_PROTECTION_RATE = 0.05;
export const INDICATIVE_PROTECTION_FIXED_PENCE = 50;
export const INDICATIVE_PROTECTION_CAP_PENCE = 800;

export function indicativeProtectionFeePence(itemPence: number): number {
  if (itemPence <= 0) return 0;
  const fee = Math.round(itemPence * INDICATIVE_PROTECTION_RATE) + INDICATIVE_PROTECTION_FIXED_PENCE;
  return Math.min(fee, INDICATIVE_PROTECTION_CAP_PENCE);
}

/** Sellers receive the item price; the buyer pays protection and shipping on top. */
export function indicativeSellerReceivesPence(itemPence: number): number {
  return Math.max(0, itemPence);
}

export const FEE_LINE_LABELS = {
  item: 'Item',
  protection: 'Buyer protection',
  shipping: 'Shipping',
  total: 'Total',
} as const;
