import React, { useMemo, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { useCreateListing, usePublishListing, useUpdateListing, uploadImage } from '@/api/hooks';
import { ApiError, errorMessage } from '@/api/client';
import {
  CATEGORIES,
  OPTIONAL_LISTING_FIELDS,
  REQUIRED_LISTING_FIELDS,
  type Category,
  type ListingInput,
  type ListingMeasurementField,
  type ListingMeasurements,
} from '@/api/types';
import { Banner, Button, Chip, MeasurementField, PhotoGrid, Screen, Spacer, T, TextField } from '@/components';
import { indicativeProtectionFeePence } from '@/lib/fees';
import { CATEGORY_LABELS, fieldLabel, formatPence, parseCm, parsePoundsToPence } from '@/lib/format';
import { useUiStore, type DraftPhoto } from '@/store/ui';
import { spacing } from '@/theme';

const MAX_PHOTOS = 6;
const MIN_PRICE_PENCE = 100;

/** Garment-measurement instructions for sellers. Always about the item, laid flat. */
const LISTING_INSTRUCTIONS: Record<ListingMeasurementField, string> = {
  outseam_cm: 'Waistband to hem along the outside seam.',
  inseam_cm: 'Crotch seam to hem along the inside leg.',
  rise_cm: 'Crotch seam to the top of the front waistband.',
  waist_flat_cm: 'Laid flat, waistband edge to edge. Do not double it.',
  hip_flat_cm: 'Laid flat, across the widest point of the hips.',
  pit_to_pit_cm: 'Laid flat, armpit seam to armpit seam.',
  shoulder_flat_cm: 'Laid flat, shoulder seam to shoulder seam across the back.',
  length_cm: 'Highest point of the shoulder straight down to the hem.',
};

type Errors = Partial<Record<'photos' | 'category' | 'title' | 'size_label' | 'price' | ListingMeasurementField, string>>;

export default function Sell() {
  const router = useRouter();
  const draft = useUiStore((s) => s.draft);
  const { updateDraft, setDraftMeasurement, addDraftPhoto, updateDraftPhoto, removeDraftPhoto, resetDraft } = useUiStore();
  const create = useCreateListing();
  const update = useUpdateListing();
  const publish = usePublishListing();
  const [attempted, setAttempted] = useState(false);
  const [serverErrors, setServerErrors] = useState<Errors>({});
  const [globalError, setGlobalError] = useState<string | null>(null);

  const requiredFields = draft.category ? REQUIRED_LISTING_FIELDS[draft.category] : [];
  const optionalFields = draft.category ? OPTIONAL_LISTING_FIELDS[draft.category] : [];
  const pricePence = parsePoundsToPence(draft.price_text);

  const errors: Errors = useMemo(() => {
    const e: Errors = {};
    if (draft.photos.length === 0) e.photos = 'Add at least one photo.';
    else if (draft.photos.some((p) => p.uploading)) e.photos = 'Photos are still uploading.';
    else if (draft.photos.some((p) => p.error || !p.url)) e.photos = 'One photo failed to upload. Remove it and try again.';
    else if (!draft.photos[0]?.is_modelled_fit) e.photos = 'The first photo must show the item worn. Toggle it on, or make a worn photo your cover.';
    if (!draft.category) e.category = 'Choose a category.';
    if (draft.title.trim().length < 3) e.title = 'Give it a short title.';
    if (draft.size_label.trim() === '') e.size_label = 'Add the size on the label.';
    if (pricePence === null) e.price = 'Enter a price in pounds.';
    else if (pricePence < MIN_PRICE_PENCE) e.price = `Minimum price is ${formatPence(MIN_PRICE_PENCE)}.`;
    for (const f of requiredFields) {
      const raw = draft.measurements[f] ?? '';
      if (raw.trim() === '') e[f] = 'Required to publish.';
      else if (parseCm(raw) === null) e[f] = 'Enter centimetres, e.g. 78.5';
    }
    for (const f of optionalFields) {
      const raw = draft.measurements[f] ?? '';
      if (raw.trim() !== '' && parseCm(raw) === null) e[f] = 'Enter centimetres, e.g. 78.5';
    }
    return e;
  }, [draft, pricePence, requiredFields, optionalFields]);

  const allErrors: Errors = { ...errors, ...serverErrors };
  const show = (k: keyof Errors) => (attempted ? allErrors[k] ?? null : serverErrors[k] ?? null);
  const busy = create.isPending || update.isPending || publish.isPending;

  async function pickPhotos() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Photo access needed', 'Allow photo access in Settings to add listing photos.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: MAX_PHOTOS - draft.photos.length,
      quality: 1,
    });
    if (res.canceled) return;
    for (const asset of res.assets) {
      void processAndUpload(asset);
    }
  }

  async function processAndUpload(asset: ImagePicker.ImagePickerAsset) {
    let localUri = asset.uri;
    try {
      const actions = asset.width > 1600 ? [{ resize: { width: 1600 } }] : [];
      const out = await manipulateAsync(asset.uri, actions, { compress: 0.82, format: SaveFormat.JPEG });
      localUri = out.uri;
    } catch {
      // fall back to the original file
    }
    const photo: DraftPhoto = { local_uri: localUri, url: '', is_modelled_fit: false, uploading: true, error: null };
    addDraftPhoto(photo);
    try {
      const url = await uploadImage(localUri, 'image/jpeg');
      updateDraftPhoto(localUri, { url, uploading: false });
    } catch (e) {
      updateDraftPhoto(localUri, { uploading: false, error: errorMessage(e, 'Upload failed') });
    }
  }

  function buildInput(): ListingInput | null {
    if (!draft.category || pricePence === null) return null;
    const measurements: ListingMeasurements = {};
    for (const f of [...requiredFields, ...optionalFields]) {
      const v = parseCm(draft.measurements[f] ?? '');
      if (v !== null) measurements[f] = v;
    }
    return {
      title: draft.title.trim(),
      description: draft.description.trim() || undefined,
      category: draft.category,
      brand: draft.brand.trim() || undefined,
      size_label: draft.size_label.trim(),
      price_pence: pricePence,
      photos: draft.photos.map((p) => ({ url: p.url, is_modelled_fit: p.is_modelled_fit })),
      measurements,
    };
  }

  async function onPublish() {
    setAttempted(true);
    setServerErrors({});
    setGlobalError(null);
    if (Object.keys(errors).length > 0) return;
    const input = buildInput();
    if (!input) return;
    try {
      const listing = draft.server_listing_id
        ? await update.mutateAsync({ id: draft.server_listing_id, patch: input })
        : await create.mutateAsync(input);
      updateDraft({ server_listing_id: listing.id });
      const published = await publish.mutateAsync(listing.id);
      resetDraft();
      setAttempted(false);
      router.push(`/listing/${published.id}`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 422) {
        const fe = e.fieldErrors;
        const mapped: Errors = {};
        for (const [k, msg] of Object.entries(fe)) {
          const key = (k.endsWith('_cm') ? k : `${k}_cm`) as ListingMeasurementField;
          if (key in LISTING_INSTRUCTIONS) mapped[key] = msg;
          else if (k === 'photos') mapped.photos = msg;
          else if (k === 'price_pence') mapped.price = msg;
          else if (k === 'title' || k === 'size_label' || k === 'category') mapped[k] = msg;
        }
        setServerErrors(mapped);
        setGlobalError(Object.keys(mapped).length ? 'Fix the highlighted fields to publish.' : e.message);
      } else {
        setGlobalError(errorMessage(e));
      }
    }
  }

  function setCategory(c: Category) {
    updateDraft({ category: c });
    setServerErrors({});
  }

  return (
    <Screen>
      <T v="h2">Sell an item</T>
      <T v="bodyMuted" style={{ marginTop: spacing.xs }}>
        Photos, a few details, then the measurements that make Twind work. About a minute.
      </T>

      <Spacer size={spacing.xl} />
      <T v="h3">1. Photos</T>
      <T v="small" style={{ marginBottom: spacing.sm }}>
        The first photo should show the item being worn.
      </T>
      <PhotoGrid
        photos={draft.photos}
        max={MAX_PHOTOS}
        onAdd={() => void pickPhotos()}
        onRemove={removeDraftPhoto}
        onToggleModelled={(uri, v) => updateDraftPhoto(uri, { is_modelled_fit: v })}
        error={show('photos')}
      />

      <Spacer size={spacing.xl} />
      <T v="h3">2. The basics</T>
      <Spacer size={spacing.sm} />
      <T v="label" style={{ marginBottom: spacing.xs }}>
        Category
      </T>
      <View style={styles.chips}>
        {CATEGORIES.map((c) => (
          <Chip key={c} label={CATEGORY_LABELS[c]} selected={draft.category === c} onPress={() => setCategory(c)} />
        ))}
      </View>
      {show('category') ? <T v="small" style={styles.error}>{show('category')}</T> : null}
      <Spacer size={spacing.md} />
      <TextField label="Title" value={draft.title} onChangeText={(v) => updateDraft({ title: v })} placeholder="e.g. Levi's 501 straight jeans" error={show('title')} maxLength={80} />
      <TextField label="Brand (optional)" value={draft.brand} onChangeText={(v) => updateDraft({ brand: v })} placeholder="e.g. Levi's" maxLength={60} />
      <TextField label="Size on the label" value={draft.size_label} onChangeText={(v) => updateDraft({ size_label: v })} placeholder="e.g. W30 L32, UK 12, M" error={show('size_label')} maxLength={30} />
      <TextField
        label="Price (£)"
        value={draft.price_text}
        onChangeText={(v) => updateDraft({ price_text: v })}
        keyboardType="decimal-pad"
        inputMode="decimal"
        placeholder="e.g. 24"
        error={show('price')}
        hint={pricePence !== null && pricePence >= MIN_PRICE_PENCE ? `You receive ${formatPence(pricePence)}. Buyers pay about ${formatPence(indicativeProtectionFeePence(pricePence))} protection on top (exact fee shown at checkout).` : undefined}
      />
      <TextField label="Description (optional)" value={draft.description} onChangeText={(v) => updateDraft({ description: v })} placeholder="Condition, fabric, anything a buyer should know" multiline numberOfLines={3} style={{ minHeight: 84, paddingTop: 12 }} maxLength={1000} />

      <Spacer size={spacing.lg} />
      <T v="h3">3. Garment measurements</T>
      {draft.category ? (
        <>
          <T v="small" style={{ marginBottom: spacing.md }}>
            Lay the item flat and measure in centimetres. These are required: they're what lets buyers see a real fit score instead of guessing from the size label.
          </T>
          {requiredFields.map((f) => (
            <MeasurementField
              key={f}
              label={fieldLabel(f)}
              instruction={LISTING_INSTRUCTIONS[f]}
              value={draft.measurements[f] ?? ''}
              onChangeText={(v) => setDraftMeasurement(f, v)}
              required
              error={show(f)}
              testID={`listing-${f}`}
            />
          ))}
          {optionalFields.map((f) => (
            <MeasurementField
              key={f}
              label={fieldLabel(f)}
              instruction={LISTING_INSTRUCTIONS[f]}
              value={draft.measurements[f] ?? ''}
              onChangeText={(v) => setDraftMeasurement(f, v)}
              error={show(f)}
              testID={`listing-${f}`}
            />
          ))}
        </>
      ) : (
        <T v="small">Choose a category above to see which measurements this item needs.</T>
      )}

      {globalError ? (
        <>
          <Spacer size={spacing.md} />
          <Banner tone="danger">{globalError}</Banner>
        </>
      ) : null}
      {attempted && Object.keys(errors).length > 0 && !globalError ? (
        <>
          <Spacer size={spacing.md} />
          <Banner tone="warning">A few things need fixing before this can go live. Check the highlighted fields.</Banner>
        </>
      ) : null}

      <Spacer size={spacing.xl} />
      <Button title="Publish listing" onPress={() => void onPublish()} loading={busy} />
      <Spacer size={spacing.sm} />
      <Button
        title="Clear draft"
        variant="ghost"
        onPress={() =>
          Alert.alert('Clear this draft?', 'Photos and details you have entered will be removed.', [
            { text: 'Keep', style: 'cancel' },
            { text: 'Clear', style: 'destructive', onPress: () => { resetDraft(); setAttempted(false); setServerErrors({}); setGlobalError(null); } },
          ])
        }
        disabled={busy}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  error: { color: '#B91C1C', marginTop: spacing.xs },
});
