/**
 * Stripe wrapper. The app must run without a publishable key, so every Stripe call
 * is funnelled through here and degrades gracefully when payments are disabled.
 */
import React from 'react';
import { StripeProvider, useStripe } from '@stripe/stripe-react-native';
import { config, paymentsEnabled } from '../config';

export function TwindStripeProvider({ children }: { children: React.ReactNode }) {
  if (!paymentsEnabled) return <>{children}</>;
  return (
    <StripeProvider
      publishableKey={config.stripePublishableKey}
      merchantIdentifier="merchant.app.twind"
      urlScheme="twind"
    >
      <>{children}</>
    </StripeProvider>
  );
}

export type PaymentOutcome =
  | { status: 'paid' }
  | { status: 'cancelled' }
  | { status: 'disabled' }
  | { status: 'error'; message: string };

/**
 * Hook returning a `pay(clientSecret)` function that presents the Payment Sheet.
 * When payments are disabled it resolves to `{ status: 'disabled' }` without touching Stripe.
 */
export function usePaymentSheet() {
  // useStripe is safe to call even without a provider; its methods reject if uninitialised.
  const stripe = useStripe();

  async function pay(clientSecret: string, opts: { merchantDisplayName?: string } = {}): Promise<PaymentOutcome> {
    if (!paymentsEnabled) return { status: 'disabled' };
    const init = await stripe.initPaymentSheet({
      paymentIntentClientSecret: clientSecret,
      merchantDisplayName: opts.merchantDisplayName ?? 'Twind',
      returnURL: 'twind://checkout/return',
      allowsDelayedPaymentMethods: false,
      applePay: { merchantCountryCode: 'GB' },
      googlePay: { merchantCountryCode: 'GB', currencyCode: 'GBP', testEnv: config.stripePublishableKey.startsWith('pk_test') },
    });
    if (init.error) return { status: 'error', message: init.error.message };

    const result = await stripe.presentPaymentSheet();
    if (result.error) {
      if (result.error.code === 'Canceled') return { status: 'cancelled' };
      return { status: 'error', message: result.error.message };
    }
    return { status: 'paid' };
  }

  return { pay, paymentsEnabled };
}
