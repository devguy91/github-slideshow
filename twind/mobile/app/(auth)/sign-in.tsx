import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Banner, Button, Checkbox, Chip, Screen, Spacer, T, TextField } from '@/components';
import { getAuthAdapter, type OtpChallenge, type OtpChannel } from '@/lib/auth';
import { errorMessage } from '@/api/client';
import { config } from '@/config';
import { spacing } from '@/theme';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[0-9 ()-]{7,20}$/;

export default function SignIn() {
  const router = useRouter();
  const adapter = getAuthAdapter();
  const [channel, setChannel] = useState<OtpChannel>('email');
  const [destination, setDestination] = useState('');
  const [isAdult, setIsAdult] = useState(false);
  const [challenge, setChallenge] = useState<OtpChallenge | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const destinationValid = channel === 'email' ? EMAIL_RE.test(destination.trim()) : PHONE_RE.test(destination.trim());
  const canContinue = destinationValid && isAdult && !busy;

  async function start() {
    setError(null);
    setBusy(true);
    try {
      const ch = await adapter.requestOtp(channel, destination.trim());
      if (!ch.requires_code) {
        await adapter.verifyOtp(ch, '');
        router.replace('/(tabs)');
        return;
      }
      setChallenge(ch);
    } catch (e) {
      setError(errorMessage(e, 'Could not send a code'));
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    if (!challenge) return;
    setError(null);
    setBusy(true);
    try {
      await adapter.verifyOtp(challenge, code.trim());
      router.replace('/(tabs)');
    } catch (e) {
      setError(errorMessage(e, 'That code did not work'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Spacer size={spacing.xxl} />
        <T v="h1">Twind</T>
        <T v="bodyMuted" style={{ marginTop: spacing.xs }}>
          Secondhand clothes that fit, from people shaped like you.
        </T>
        <Spacer size={spacing.xxl} />

        {challenge ? (
          <>
            <T v="h2">Enter your code</T>
            <T v="bodyMuted" style={{ marginTop: spacing.xs, marginBottom: spacing.lg }}>
              We sent a 6-digit code to {challenge.destination}.
            </T>
            <TextField
              label="Code"
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              maxLength={8}
              autoFocus
            />
            {error ? <Banner tone="danger">{error}</Banner> : null}
            <Spacer />
            <Button title="Verify" onPress={verify} disabled={code.trim().length < 4} loading={busy} />
            <Spacer size={spacing.sm} />
            <Button title="Use a different address" variant="ghost" onPress={() => { setChallenge(null); setCode(''); }} />
          </>
        ) : (
          <>
            <View style={styles.channelRow}>
              <Chip label="Email" selected={channel === 'email'} onPress={() => setChannel('email')} />
              <Chip label="Phone" selected={channel === 'phone'} onPress={() => setChannel('phone')} />
            </View>
            <TextField
              label={channel === 'email' ? 'Email address' : 'Mobile number'}
              value={destination}
              onChangeText={setDestination}
              keyboardType={channel === 'email' ? 'email-address' : 'phone-pad'}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete={channel === 'email' ? 'email' : 'tel'}
              placeholder={channel === 'email' ? 'you@example.com' : '+44 7700 900000'}
              error={destination.length > 0 && !destinationValid ? `Enter a valid ${channel === 'email' ? 'email address' : 'phone number'}` : null}
            />
            <Checkbox
              checked={isAdult}
              onChange={setIsAdult}
              label={
                <T v="body">
                  I confirm I am <T v="label">18 or older</T>. Twind is a marketplace for adults only.
                </T>
              }
            />
            {error ? (
              <>
                <Spacer size={spacing.md} />
                <Banner tone="danger">{error}</Banner>
              </>
            ) : null}
            <Spacer />
            <Button title="Continue" onPress={start} disabled={!canContinue} loading={busy} />
            <Spacer size={spacing.md} />
            <T v="small" center>
              We'll send a one-time code. No passwords.
            </T>
            {adapter.name === 'dev' ? (
              <>
                <Spacer size={spacing.xl} />
                <Banner tone="warning">
                  Dev sign-in: any {channel} mints a token from {config.apiUrl}/v1/dev/token. No code is sent.
                </Banner>
              </>
            ) : null}
          </>
        )}
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  channelRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
});
