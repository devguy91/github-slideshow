import React, { useEffect, useMemo } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ApiError } from '@/api/client';
import { useBodyProfile } from '@/api/hooks';
import { Loading } from '@/components';
import { SessionProvider, useSession } from '@/lib/session';
import { setToken } from '@/lib/auth';
import { TwindStripeProvider } from '@/lib/stripe';
import { registerForPushNotifications } from '@/lib/notifications';
import { colors } from '@/theme';

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        retry: (count, err) => {
          if (err instanceof ApiError && err.status >= 400 && err.status < 500) return false;
          return count < 2;
        },
      },
    },
  });
}

/**
 * Auth + onboarding gate.
 *  - No token            -> /(auth)/sign-in
 *  - Token, no body row  -> /(onboarding)/style
 *  - Token, body without height/size -> /(onboarding)/height-size
 *  - Otherwise            -> app
 */
function Gate({ children }: { children: React.ReactNode }) {
  const session = useSession();
  const segments = useSegments();
  const router = useRouter();
  const body = useBodyProfile(session.signedIn);

  const group = segments[0];
  const inAuth = group === '(auth)';
  const inOnboarding = group === '(onboarding)';

  const bodyMissing = body.error instanceof ApiError && body.error.status === 404;
  const bodyReady = !session.signedIn || body.isSuccess || body.isError;
  const needsOnboarding =
    session.signedIn && (bodyMissing || (body.isSuccess && (!body.data.height_cm || !body.data.usual_size)));

  useEffect(() => {
    if (!session.ready) return;
    if (session.signedIn && body.error instanceof ApiError && body.error.isUnauthorized) {
      void setToken(null);
      return;
    }
    if (!session.signedIn) {
      if (!inAuth) router.replace('/(auth)/sign-in');
      return;
    }
    if (!bodyReady) return;
    if (needsOnboarding && !inOnboarding) {
      router.replace(bodyMissing ? '/(onboarding)/style' : '/(onboarding)/height-size');
      return;
    }
    if (inAuth) router.replace('/(tabs)');
  }, [session.ready, session.signedIn, bodyReady, needsOnboarding, bodyMissing, inAuth, inOnboarding, router, body.error]);

  useEffect(() => {
    if (session.signedIn) void registerForPushNotifications();
  }, [session.signedIn]);

  if (!session.ready || (session.signedIn && !bodyReady && !inOnboarding && !inAuth)) {
    return <Loading />;
  }
  return <>{children}</>;
}

export default function RootLayout() {
  const queryClient = useMemo(makeQueryClient, []);
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <TwindStripeProvider>
            <StatusBar style="dark" backgroundColor={colors.bg} />
            <Gate>
              <Stack
                screenOptions={{
                  headerStyle: { backgroundColor: colors.bg },
                  headerShadowVisible: false,
                  headerTintColor: colors.text,
                  headerTitleStyle: { fontWeight: '600' },
                  contentStyle: { backgroundColor: colors.bg },
                  headerBackTitle: 'Back',
                }}
              >
                <Stack.Screen name="(auth)" options={{ headerShown: false }} />
                <Stack.Screen name="(onboarding)" options={{ headerShown: false }} />
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen name="listing/[id]" options={{ title: 'Listing' }} />
                <Stack.Screen name="checkout/[listingId]" options={{ title: 'Checkout' }} />
                <Stack.Screen name="orders/index" options={{ title: 'Orders' }} />
                <Stack.Screen name="orders/[id]" options={{ title: 'Order' }} />
                <Stack.Screen name="fit-rating/[orderId]" options={{ title: 'Did it fit?' }} />
                <Stack.Screen name="measurements" options={{ title: 'Your measurements' }} />
                <Stack.Screen name="settings" options={{ title: 'Settings' }} />
              </Stack>
            </Gate>
          </TwindStripeProvider>
        </SessionProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
