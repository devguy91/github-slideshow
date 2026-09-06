import React, { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { useQueryClient } from '@tanstack/react-query';
import { useMe, useUpdateMe } from '@/api/hooks';
import { errorMessage } from '@/api/client';
import { Banner, Button, Card, Divider, ErrorState, Loading, Row, Screen, Spacer, T, TextField } from '@/components';
import { config, paymentsEnabled } from '@/config';
import { getAuthAdapter, signOut } from '@/lib/auth';
import { useUiStore } from '@/store/ui';
import { spacing } from '@/theme';

const HANDLE_RE = /^[a-z0-9_]{3,20}$/;

export default function Settings() {
  const router = useRouter();
  const qc = useQueryClient();
  const me = useMe();
  const update = useUpdateMe();
  const resetOnboarding = useUiStore((s) => s.resetOnboarding);
  const resetDraft = useUiStore((s) => s.resetDraft);
  const [handle, setHandle] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [seeded, setSeeded] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);

  useEffect(() => {
    if (me.data && !seeded) {
      setHandle(me.data.handle ?? '');
      setDisplayName(me.data.display_name ?? '');
      setBio(me.data.bio ?? '');
      setSeeded(true);
    }
  }, [me.data, seeded]);

  if (me.isPending) return <Loading />;
  if (me.isError) return <ErrorState message={errorMessage(me.error)} onRetry={() => void me.refetch()} />;

  const handleValid = handle === '' || HANDLE_RE.test(handle);

  async function onSave() {
    setMessage(null);
    try {
      await update.mutateAsync({
        handle: handle || undefined,
        display_name: displayName.trim() || undefined,
        bio: bio.trim() || undefined,
      });
      setMessage({ tone: 'success', text: 'Saved.' });
    } catch (e) {
      setMessage({ tone: 'danger', text: errorMessage(e) });
    }
  }

  function onSignOut() {
    Alert.alert('Sign out?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          resetOnboarding();
          resetDraft();
          qc.clear();
          router.replace('/(auth)/sign-in');
        },
      },
    ]);
  }

  return (
    <Screen>
      <T v="h3">Profile</T>
      <Spacer size={spacing.sm} />
      <TextField
        label="Handle"
        value={handle}
        onChangeText={(v) => setHandle(v.toLowerCase())}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="yourname"
        error={!handleValid ? '3–20 characters: lowercase letters, numbers, underscores' : null}
      />
      <TextField label="Display name" value={displayName} onChangeText={setDisplayName} placeholder="How you appear to others" maxLength={40} />
      <TextField label="Bio" value={bio} onChangeText={setBio} multiline numberOfLines={3} style={{ minHeight: 84, paddingTop: 12 }} maxLength={280} />
      {message ? <Banner tone={message.tone}>{message.text}</Banner> : null}
      <Spacer size={spacing.sm} />
      <Button title="Save" onPress={() => void onSave()} loading={update.isPending} disabled={!handleValid} />

      <Spacer size={spacing.xl} />
      <T v="h3">Fit</T>
      <Spacer size={spacing.sm} />
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <T v="body">Your measurements</T>
          <Button title="Edit" variant="ghost" small onPress={() => router.push('/measurements')} />
        </Row>
        <Divider />
        <T v="small">
          Your measurements are private. Other people only ever see fit scores computed against their own bodies, and your public profile never shows measurements.
        </T>
      </Card>

      <Spacer size={spacing.xl} />
      <T v="h3">Selling</T>
      <Spacer size={spacing.sm} />
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <T v="body">Payouts</T>
          <T v="small">{me.data.has_stripe_account ? 'Stripe connected' : 'Set up on first sale'}</T>
        </Row>
        <Divider />
        <Row style={{ justifyContent: 'space-between' }}>
          <T v="body">Orders</T>
          <Button title="View" variant="ghost" small onPress={() => router.push('/orders')} />
        </Row>
      </Card>

      <Spacer size={spacing.xl} />
      <T v="h3">About</T>
      <Spacer size={spacing.sm} />
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <T v="bodyMuted">Version</T>
          <T v="small">{Constants.expoConfig?.version ?? '0.1.0'}</T>
        </Row>
        <Divider />
        <Row style={{ justifyContent: 'space-between' }}>
          <T v="bodyMuted">API</T>
          <T v="small" numberOfLines={1} style={{ maxWidth: '60%' }}>
            {config.apiUrl}
          </T>
        </Row>
        <Divider />
        <Row style={{ justifyContent: 'space-between' }}>
          <T v="bodyMuted">Payments</T>
          <T v="small">{paymentsEnabled ? 'Enabled' : 'Disabled (no key)'}</T>
        </Row>
        <Divider />
        <Row style={{ justifyContent: 'space-between' }}>
          <T v="bodyMuted">Auth adapter</T>
          <T v="small">{getAuthAdapter().name}</T>
        </Row>
      </Card>

      <Spacer size={spacing.xl} />
      <View>
        <Button title="Sign out" variant="danger" onPress={onSignOut} />
      </View>
    </Screen>
  );
}
