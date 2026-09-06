/**
 * TypeScript mirror of twind/docs/api-contract.md (v1).
 * Money is integer pence. Measurements are centimetres, floats, nullable.
 * Fit and style scores are separate 0..100 integers and are never combined.
 */

export type Accuracy = {
  score: number | null;
  rated_sales: number;
  badge: boolean;
};

export type User = {
  id: string;
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  is_founding_seller: boolean;
  has_stripe_account: boolean;
  slice_id: string | null;
  created_at: string;
  accuracy: Accuracy;
};

export type UserPatch = {
  handle?: string;
  display_name?: string;
  bio?: string;
  avatar_url?: string;
};

export type PublicProfile = {
  id: string;
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  twin_count: number;
  listing_count: number;
  accuracy_badge: boolean;
};

// ---------------------------------------------------------------------------
// Body profile
// ---------------------------------------------------------------------------

export type MeasurementSource = 'picker' | 'garment' | 'typed';

/** Numeric body-profile fields (all centimetres). Weight is intentionally absent. */
export type BodyMeasurementField =
  | 'height_cm'
  | 'outseam_cm'
  | 'inseam_cm'
  | 'rise_cm'
  | 'waist_cm'
  | 'hip_cm'
  | 'shoulder_cm'
  | 'torso_length_cm'
  | 'bust_cm';

export const BODY_MEASUREMENT_FIELDS: readonly BodyMeasurementField[] = [
  'height_cm',
  'outseam_cm',
  'inseam_cm',
  'rise_cm',
  'waist_cm',
  'hip_cm',
  'shoulder_cm',
  'torso_length_cm',
  'bust_cm',
];

export type BodyProfileInput = {
  height_cm?: number | null;
  usual_size?: string | null;
  outseam_cm?: number | null;
  inseam_cm?: number | null;
  rise_cm?: number | null;
  waist_cm?: number | null;
  hip_cm?: number | null;
  shoulder_cm?: number | null;
  torso_length_cm?: number | null;
  bust_cm?: number | null;
  source_per_field?: Partial<Record<BodyMeasurementField | 'usual_size', MeasurementSource>>;
};

export type PrecisionTier = 'estimated' | 'measured' | 'confirmed';

export type BodyProfile = BodyProfileInput & {
  precision_tier: PrecisionTier;
  /** Capability framing, e.g. ["exact_fit_scores"]. */
  unlocked: string[];
  /** Next capability the user can unlock. Never "incomplete". */
  next_unlock: string | null;
  updated_at: string;
};

export type MatchCount = { match_count: number };

// ---------------------------------------------------------------------------
// Onboarding pickers
// ---------------------------------------------------------------------------

export type SliceStatus = {
  slice_id: string;
  is_open: boolean;
  progress: number;
  member_count: number;
  member_target: number;
};

export type HeightSizeResponse = BodyProfile & { slice: SliceStatus };

export type PickerOption = {
  index: 0 | 1 | 2;
  image_url: string;
  consent_id: string;
};

export type PickerRound = {
  round: number;
  prompt: string;
  options: PickerOption[];
};

export type StyleVectorResponse = { style_vector: number[] };

// ---------------------------------------------------------------------------
// Listings
// ---------------------------------------------------------------------------

export type Category = 'bottoms' | 'tops' | 'dresses';
export const CATEGORIES: readonly Category[] = ['bottoms', 'tops', 'dresses'];

export type ListingStatus = 'draft' | 'live' | 'sold' | 'removed';

export type ListingPhoto = {
  url: string;
  is_modelled_fit: boolean;
};

export type ListingMeasurementField =
  | 'outseam_cm'
  | 'inseam_cm'
  | 'rise_cm'
  | 'waist_flat_cm'
  | 'hip_flat_cm'
  | 'pit_to_pit_cm'
  | 'shoulder_flat_cm'
  | 'length_cm';

export type ListingMeasurements = Partial<Record<ListingMeasurementField, number | null>>;

/** Required-to-publish fields per category, straight from the contract. */
export const REQUIRED_LISTING_FIELDS: Record<Category, readonly ListingMeasurementField[]> = {
  bottoms: ['outseam_cm', 'inseam_cm', 'rise_cm', 'waist_flat_cm'],
  tops: ['pit_to_pit_cm', 'shoulder_flat_cm', 'length_cm'],
  dresses: ['shoulder_flat_cm', 'length_cm', 'waist_flat_cm'],
};

/** Optional fields that still make sense to offer per category. */
export const OPTIONAL_LISTING_FIELDS: Record<Category, readonly ListingMeasurementField[]> = {
  bottoms: ['hip_flat_cm'],
  tops: [],
  dresses: ['hip_flat_cm', 'pit_to_pit_cm'],
};

export type ListingInput = {
  title: string;
  description?: string;
  category: Category;
  brand?: string;
  size_label: string;
  price_pence: number;
  photos: ListingPhoto[];
  measurements: ListingMeasurements;
};

export type MatchReason = 'twin' | 'following' | 'match';

export type FitMatch = {
  fit_score: number;
  fit_confidence: number;
  style_score: number;
  fields_used: string[];
  reason: MatchReason;
};

export type Listing = ListingInput & {
  id: string;
  seller: PublicProfile;
  status: ListingStatus;
  created_at: string;
  match?: FitMatch;
};

export type SignedUpload = { upload_url: string; public_url: string };

// ---------------------------------------------------------------------------
// Feed
// ---------------------------------------------------------------------------

export type FeedCard = {
  listing: Listing;
  fit_score: number;
  fit_confidence: number;
  style_score: number;
  reason: MatchReason;
};

export type FeedPage = {
  twins: FeedCard[];
  items: FeedCard[];
  next_cursor: string | null;
};

export type TwinsResponse = { twins: PublicProfile[]; count: number };

// ---------------------------------------------------------------------------
// Orders / checkout
// ---------------------------------------------------------------------------

export type Quote = {
  item_pence: number;
  protection_fee_pence: number;
  shipping_pence: number;
  total_pence: number;
  protection_fee_waived: boolean;
  waived_reason: string | null;
};

export type OrderStatus = 'pending' | 'paid' | 'shipped' | 'delivered' | 'released' | 'refunded';

export type Order = {
  id: string;
  listing: Listing;
  buyer_id: string;
  seller_id: string;
  amount_pence: number;
  protection_fee_pence: number;
  shipping_pence: number;
  status: OrderStatus;
  auto_release_at: string | null;
  created_at: string;
  fit_rating: FitRating | null;
};

export type CreateOrderResponse = {
  order: Order;
  payment: { client_secret: string; publishable_key: string };
};

export type OrderRole = 'buyer' | 'seller';

// ---------------------------------------------------------------------------
// Fit rating (private, never public)
// ---------------------------------------------------------------------------

export type Issue =
  | 'too_short'
  | 'too_long'
  | 'waist_tight'
  | 'waist_loose'
  | 'hip_tight'
  | 'hip_loose'
  | 'shoulders_tight'
  | 'shoulders_loose'
  | 'chest_tight'
  | 'chest_loose'
  | 'other';

export const ISSUES: readonly Issue[] = [
  'too_short',
  'too_long',
  'waist_tight',
  'waist_loose',
  'hip_tight',
  'hip_loose',
  'shoulders_tight',
  'shoulders_loose',
  'chest_tight',
  'chest_loose',
  'other',
];

export type FitRatingInput = { fit_as_described: boolean; issues?: Issue[] };

export type FitRating = {
  order_id: string;
  fit_as_described: boolean;
  issues: Issue[];
  created_at: string;
  became_twins: boolean;
};

// ---------------------------------------------------------------------------
// Seller accuracy (private)
// ---------------------------------------------------------------------------

export type AccuracyTier = 'new' | 'good' | 'high' | 'needs_attention';

export type SellerAccuracy = {
  score: number | null;
  rated_sales: number;
  badge: boolean;
  tier: AccuracyTier;
  private_prompt: string | null;
};

// ---------------------------------------------------------------------------
// Waitlist
// ---------------------------------------------------------------------------

export type WaitlistInput = {
  email: string;
  height_cm: number;
  usual_size: string;
  referral_code?: string;
};

export type WaitlistResponse = {
  position: number;
  slice: SliceStatus;
  referral_code: string;
};

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type ValidationDetail = { loc: (string | number)[]; msg: string; type: string };
export type ErrorBody = { detail: string | ValidationDetail[] };
