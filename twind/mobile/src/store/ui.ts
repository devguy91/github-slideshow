/**
 * Zustand store for LOCAL UI state only. Server state lives in TanStack Query.
 * Holds onboarding progress, picker choices and the in-progress listing draft so
 * the user can leave the Sell tab and come back without losing work.
 */
import { create } from 'zustand';
import type { Category, ListingMeasurementField, ListingPhoto } from '../api/types';

export type OnboardingStep = 'style' | 'height-size' | 'body' | 'waitlist' | 'done';

export type DraftPhoto = ListingPhoto & {
  /** Local file URI before upload; `url` is the public URL after upload. */
  local_uri: string;
  uploading: boolean;
  error: string | null;
};

export type ListingDraft = {
  title: string;
  description: string;
  category: Category | null;
  brand: string;
  size_label: string;
  price_text: string;
  photos: DraftPhoto[];
  /** Raw typed strings so partially-typed values ("78.") survive re-renders. */
  measurements: Partial<Record<ListingMeasurementField, string>>;
  /** Server draft id once `POST /listings` has been called. */
  server_listing_id: string | null;
};

export const emptyDraft = (): ListingDraft => ({
  title: '',
  description: '',
  category: null,
  brand: '',
  size_label: '',
  price_text: '',
  photos: [],
  measurements: {},
  server_listing_id: null,
});

type UiState = {
  // Onboarding
  onboardingStep: OnboardingStep;
  styleChoices: Partial<Record<1 | 2 | 3 | 4, 0 | 1 | 2>>;
  bodyChoices: Partial<Record<1 | 2 | 3, 0 | 1 | 2>>;
  styleSkipped: boolean;
  bodySkipped: boolean;
  heightCm: number | null;
  usualSize: string | null;
  setOnboardingStep: (step: OnboardingStep) => void;
  setStyleChoice: (round: 1 | 2 | 3 | 4, choice: 0 | 1 | 2) => void;
  setBodyChoice: (round: 1 | 2 | 3, choice: 0 | 1 | 2) => void;
  skipStyle: () => void;
  skipBody: () => void;
  setHeightSize: (heightCm: number, usualSize: string) => void;
  resetOnboarding: () => void;

  // Listing draft
  draft: ListingDraft;
  updateDraft: (patch: Partial<ListingDraft>) => void;
  setDraftMeasurement: (field: ListingMeasurementField, value: string) => void;
  addDraftPhoto: (photo: DraftPhoto) => void;
  updateDraftPhoto: (localUri: string, patch: Partial<DraftPhoto>) => void;
  removeDraftPhoto: (localUri: string) => void;
  resetDraft: () => void;

  // Misc
  hasSeenPrecisionBanner: boolean;
  dismissPrecisionBanner: () => void;
};

export const useUiStore = create<UiState>((set) => ({
  onboardingStep: 'style',
  styleChoices: {},
  bodyChoices: {},
  styleSkipped: false,
  bodySkipped: false,
  heightCm: null,
  usualSize: null,
  setOnboardingStep: (onboardingStep) => set({ onboardingStep }),
  setStyleChoice: (round, choice) =>
    set((s) => ({ styleChoices: { ...s.styleChoices, [round]: choice } })),
  setBodyChoice: (round, choice) => set((s) => ({ bodyChoices: { ...s.bodyChoices, [round]: choice } })),
  skipStyle: () => set({ styleSkipped: true }),
  skipBody: () => set({ bodySkipped: true }),
  setHeightSize: (heightCm, usualSize) => set({ heightCm, usualSize }),
  resetOnboarding: () =>
    set({
      onboardingStep: 'style',
      styleChoices: {},
      bodyChoices: {},
      styleSkipped: false,
      bodySkipped: false,
      heightCm: null,
      usualSize: null,
    }),

  draft: emptyDraft(),
  updateDraft: (patch) => set((s) => ({ draft: { ...s.draft, ...patch } })),
  setDraftMeasurement: (field, value) =>
    set((s) => ({ draft: { ...s.draft, measurements: { ...s.draft.measurements, [field]: value } } })),
  addDraftPhoto: (photo) => set((s) => ({ draft: { ...s.draft, photos: [...s.draft.photos, photo] } })),
  updateDraftPhoto: (localUri, patch) =>
    set((s) => ({
      draft: {
        ...s.draft,
        photos: s.draft.photos.map((p) => (p.local_uri === localUri ? { ...p, ...patch } : p)),
      },
    })),
  removeDraftPhoto: (localUri) =>
    set((s) => ({ draft: { ...s.draft, photos: s.draft.photos.filter((p) => p.local_uri !== localUri) } })),
  resetDraft: () => set({ draft: emptyDraft() }),

  hasSeenPrecisionBanner: false,
  dismissPrecisionBanner: () => set({ hasSeenPrecisionBanner: true }),
}));
