import React, { useState } from 'react';
import { Share, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useJoinWaitlist, useSliceStatus } from '@/api/hooks';
import { errorMessage } from '@/api/client';
import { Banner, Button, Card, LinkText, ProgressBar, Screen, Spacer, T, TextField } from '@/components';
import { config } from '@/config';
import { useUiStore } from '@/store/ui';
import { colors, spacing } from '@/theme';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Waitlist() {
  const router = useRouter();
  const { heightCm, usualSize, setOnboardingStep } = useUiStore();
  const slice = useSliceStatus(heightCm, usualSize);
  const join = useJoinWaitlist();
  const [email, setEmail] = useState('');
  const [referral, setReferral] = useState('');
  const [error, setError] = useState<string | null>(null);

  const status = join.data?.slice ?? slice.data;
  const progress = status?.progress ?? 0;
  const remaining = status ? Math.max(0, status.member_target - status.member_count) : null;
  const referralLink = join.data ? `${config.webOrigin}/r/${join.data.referral_code}` : null;

  async function submit() {
    if (heightCm === null || !usualSize) return;
    setError(null);
    try {
      await join.mutateAsync({
        email: email.trim(),
        height_cm: heightCm,
        usual_size: usualSize,
        referral_code: referral.trim() || undefined,
      });
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function share() {
    if (!referralLink) return;
    try {
      await Share.share({
        message: `I'm on the Twind waitlist for ${usualSize} at ${heightCm} cm. Join with my link and we both open the slice sooner: ${referralLink}`,
      });
    } catch {
      // user dismissed the share sheet
    }
  }

  function continueAnyway() {
    setOnboardingStep('body');
    router.replace('/(onboarding)/body');
  }

  return (
    <Screen>
      <T v="h2">Your size group isn't open yet</T>
      <T v="bodyMuted" style={{ marginTop: spacing.xs }}>
        Twind opens each height-and-size group once there are enough people in it to make matches worthwhile.
      </T>
      <Spacer size={spacing.xl} />
      <Card>
        <T v="label">
          {usualSize} · {heightCm} cm
        </T>
        <Spacer size={spacing.md} />
        <ProgressBar value={progress} />
        <Spacer size={spacing.sm} />
        <View style={styles.between}>
          <T v="small">{status ? `${status.member_count} of ${status.member_target}` : slice.isPending ? 'Checking…' : '—'}</T>
          <T v="small">{remaining !== null ? `${remaining} to go` : ''}</T>
        </View>
        {join.data ? (
          <T v="small" style={{ marginTop: spacing.sm, color: colors.success }}>
            You're #{join.data.position} in this group.
          </T>
        ) : null}
      </Card>
      <Spacer size={spacing.xl} />

      {join.data ? (
        <>
          <T v="h3">Bring your twins</T>
          <T v="bodyMuted" style={{ marginTop: spacing.xs }}>
            Every friend who joins with your link counts towards opening the group.
          </T>
          <Spacer size={spacing.md} />
          <Card style={{ backgroundColor: colors.surfaceAlt }}>
            <T v="label" numberOfLines={1}>
              {referralLink}
            </T>
          </Card>
          <Spacer size={spacing.md} />
          <Button title="Share your link" onPress={() => void share()} />
        </>
      ) : (
        <>
          <T v="h3">Get told the moment it opens</T>
          <Spacer size={spacing.md} />
          <TextField
            label="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            placeholder="you@example.com"
          />
          <TextField label="Referral code (optional)" value={referral} onChangeText={setReferral} autoCapitalize="characters" />
          {error ? <Banner tone="danger">{error}</Banner> : null}
          <Spacer size={spacing.md} />
          <Button title="Join the waitlist" onPress={() => void submit()} disabled={!EMAIL_RE.test(email.trim())} loading={join.isPending} />
        </>
      )}
      <View style={{ flex: 1 }} />
      <Spacer size={spacing.xl} />
      <View style={{ alignItems: 'center' }}>
        <LinkText title="Look around anyway" onPress={continueAnyway} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  between: { flexDirection: 'row', justifyContent: 'space-between' },
});
