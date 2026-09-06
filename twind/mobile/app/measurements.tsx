import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useBodyProfile, useMatchCount, useUpdateBodyProfile } from '@/api/hooks';
import { ApiError, errorMessage } from '@/api/client';
import { BODY_MEASUREMENT_FIELDS, type BodyMeasurementField, type BodyProfileInput, type MeasurementSource } from '@/api/types';
import { Banner, Button, Card, MeasurementField, PrecisionBanner, Row, Screen, Spacer, T, TextField } from '@/components';
import { fieldLabel, parseCm } from '@/lib/format';
import { colors, spacing } from '@/theme';

/**
 * Every instruction is a GARMENT measurement: something the user measures on a piece
 * of clothing that already fits them well. Never a body measurement, never weight.
 */
const INSTRUCTIONS: Record<BodyMeasurementField, string> = {
  height_cm: 'Your height. The one thing here that isn\'t a garment.',
  outseam_cm: 'Your best-fitting jeans: waistband to hem along the outside seam.',
  inseam_cm: 'Same jeans: crotch seam to hem along the inside leg.',
  rise_cm: 'Same jeans: crotch seam up to the top of the front waistband.',
  waist_cm: 'Same jeans laid flat: waistband edge to edge, then double it.',
  hip_cm: 'Same jeans laid flat: across the widest point of the hips, then double it.',
  shoulder_cm: 'A top that fits you well: shoulder seam to shoulder seam across the back.',
  torso_length_cm: 'Same top: highest point of the shoulder straight down to the hem.',
  bust_cm: 'Optional. A well-fitting top laid flat: armpit to armpit, then double it.',
};

const GROUPS: { title: string; fields: BodyMeasurementField[] }[] = [
  { title: 'Bottoms (measure a pair of jeans or trousers that fit)', fields: ['outseam_cm', 'inseam_cm', 'rise_cm', 'waist_cm', 'hip_cm'] },
  { title: 'Tops (measure a top that fits)', fields: ['shoulder_cm', 'torso_length_cm', 'bust_cm'] },
];

type Values = Record<BodyMeasurementField, string>;

function toValues(profile: BodyProfileInput | undefined): Values {
  const v = {} as Values;
  for (const f of BODY_MEASUREMENT_FIELDS) {
    const n = profile?.[f];
    v[f] = n == null ? '' : String(Math.round(n * 10) / 10);
  }
  return v;
}

export default function Measurements() {
  const router = useRouter();
  const body = useBodyProfile();
  const save = useUpdateBodyProfile();
  const [values, setValues] = useState<Values>(() => toValues(undefined));
  const [usualSize, setUsualSize] = useState('');
  const [touched, setTouched] = useState<Partial<Record<BodyMeasurementField, true>>>({});
  const [seeded, setSeeded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const profile = body.isSuccess ? body.data : undefined;
  const bodyMissing = body.error instanceof ApiError && body.error.status === 404;

  useEffect(() => {
    if (seeded) return;
    if (profile) {
      setValues(toValues(profile));
      setUsualSize(profile.usual_size ?? '');
      setSeeded(true);
    } else if (bodyMissing) {
      setSeeded(true);
    }
  }, [profile, bodyMissing, seeded]);

  const sources = profile?.source_per_field ?? {};
  const sourceFor = (f: BodyMeasurementField): MeasurementSource | undefined => (touched[f] ? 'typed' : sources[f]);

  const input: BodyProfileInput = useMemo(() => {
    const out: BodyProfileInput = {};
    for (const f of BODY_MEASUREMENT_FIELDS) {
      const n = parseCm(values[f]);
      if (n !== null) out[f] = n;
    }
    if (usualSize.trim()) out.usual_size = usualSize.trim();
    return out;
  }, [values, usualSize]);

  const matchCount = useMatchCount(input);

  const fieldErrors = useMemo(() => {
    const e: Partial<Record<BodyMeasurementField, string>> = {};
    for (const f of BODY_MEASUREMENT_FIELDS) {
      if (values[f].trim() !== '' && parseCm(values[f]) === null) e[f] = 'Enter centimetres, e.g. 78.5';
    }
    return e;
  }, [values]);

  const filledCount = BODY_MEASUREMENT_FIELDS.filter((f) => parseCm(values[f]) !== null).length;

  function setField(f: BodyMeasurementField, v: string) {
    setValues((cur) => ({ ...cur, [f]: v }));
    setTouched((cur) => ({ ...cur, [f]: true }));
    setSaved(false);
  }

  async function onSave() {
    setError(null);
    if (Object.keys(fieldErrors).length > 0) return;
    const source_per_field: BodyProfileInput['source_per_field'] = {};
    const payload: BodyProfileInput = { ...input };
    for (const f of BODY_MEASUREMENT_FIELDS) {
      if (touched[f]) {
        // Sending null clears a field the user emptied; typed values become source "typed".
        payload[f] = parseCm(values[f]);
        source_per_field[f] = 'typed';
      }
    }
    if (usualSize.trim() !== (profile?.usual_size ?? '')) source_per_field.usual_size = 'typed';
    payload.source_per_field = source_per_field;
    try {
      await save.mutateAsync(payload);
      setTouched({});
      setSaved(true);
      setSeeded(false);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <Screen>
      <T v="h2">Your measurements</T>
      <T v="bodyMuted" style={{ marginTop: spacing.xs }}>
        Grab clothes that already fit you well and measure them. Every field is optional; each one you add makes your fit scores sharper. Values marked <T v="label" color={colors.warning}>estimate</T> came from the shape picker and can be typed over.
      </T>

      <Spacer size={spacing.lg} />
      <Card style={styles.liveCard}>
        <Row style={{ justifyContent: 'space-between' }}>
          <View>
            <T v="caption">Live</T>
            <T v="h2">
              {matchCount.data ? `${matchCount.data.match_count} items` : matchCount.isPending ? '…' : '—'}
            </T>
            <T v="small">match you right now</T>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <T v="h3">{filledCount}/{BODY_MEASUREMENT_FIELDS.length}</T>
            <T v="small">measurements</T>
            {matchCount.isSettling || matchCount.isFetching ? <T v="caption">updating…</T> : null}
          </View>
        </Row>
      </Card>

      {profile ? (
        <>
          <Spacer size={spacing.md} />
          <PrecisionBanner profile={profile} />
        </>
      ) : null}

      <Spacer size={spacing.xl} />
      <TextField label="Usual size" value={usualSize} onChangeText={(v) => { setUsualSize(v); setSaved(false); }} placeholder="e.g. UK 12" autoCapitalize="characters" />
      <MeasurementField
        label={fieldLabel('height_cm')}
        instruction={INSTRUCTIONS.height_cm}
        value={values.height_cm}
        onChangeText={(v) => setField('height_cm', v)}
        source={sourceFor('height_cm')}
        error={fieldErrors.height_cm ?? null}
        testID="body-height_cm"
      />

      {GROUPS.map((g) => (
        <View key={g.title}>
          <Spacer size={spacing.md} />
          <T v="h3" style={{ marginBottom: spacing.md }}>
            {g.title}
          </T>
          {g.fields.map((f) => (
            <MeasurementField
              key={f}
              label={fieldLabel(f)}
              instruction={INSTRUCTIONS[f]}
              value={values[f]}
              onChangeText={(v) => setField(f, v)}
              source={sourceFor(f)}
              optionalNote={f === 'bust_cm' ? 'optional, skip if you like' : undefined}
              error={fieldErrors[f] ?? null}
              testID={`body-${f}`}
            />
          ))}
        </View>
      ))}

      {error ? <Banner tone="danger">{error}</Banner> : null}
      {saved ? <Banner tone="success">Saved. Your feed will re-rank with the new numbers.</Banner> : null}
      <Spacer size={spacing.lg} />
      <Button title="Save" onPress={() => void onSave()} loading={save.isPending} disabled={Object.keys(fieldErrors).length > 0} />
      <Spacer size={spacing.sm} />
      <Button title="Done" variant="ghost" onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  liveCard: { backgroundColor: colors.surfaceAlt, borderColor: colors.surfaceAlt },
});
