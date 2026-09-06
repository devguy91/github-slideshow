/**
 * Runtime configuration. Expo inlines `EXPO_PUBLIC_*` variables at build time.
 * Defaults keep the app runnable with no .env file at all.
 */
const rawApiUrl = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000';

export const config = {
  /** Base URL of the API server, without trailing slash and without `/v1`. */
  apiUrl: rawApiUrl.replace(/\/+$/, ''),
  /** Stripe publishable key. Empty string means payments are disabled in this build. */
  stripePublishableKey: process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '',
  /** Public web origin used to build shareable referral links. */
  webOrigin: 'https://twind.app',
} as const;

export const paymentsEnabled = config.stripePublishableKey.length > 0;
