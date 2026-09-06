import React from 'react';
import { Stack } from 'expo-router';
import { colors } from '@/theme';

export default function OnboardingLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerShadowVisible: false,
        headerTintColor: colors.text,
        headerBackVisible: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="style" options={{ title: 'Your style' }} />
      <Stack.Screen name="height-size" options={{ title: 'Height and size' }} />
      <Stack.Screen name="body" options={{ title: 'Your shape' }} />
      <Stack.Screen name="waitlist" options={{ title: 'Almost open' }} />
    </Stack>
  );
}
