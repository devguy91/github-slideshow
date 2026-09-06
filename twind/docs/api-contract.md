# Twind API contract (v1)

Base URL: `${API_URL}/v1`. All requests except `/health`, `/slices`, `/waitlist` require
`Authorization: Bearer <jwt>`. The JWT is issued by the auth provider (Supabase Auth / Clerk)
and verified server-side; the server upserts a `users` row on first sight of a new `sub`.

Money is always integer pence. Measurements are always centimetres, floats, nullable.
Fit and style scores are separate integers 0–100 and are never combined into one number
in any response.

## Health
`GET /health` → `{ "status": "ok" }`

## Me / users
- `GET /me` → `User`
- `PATCH /me` body `{ handle?, display_name?, bio?, avatar_url? }` → `User`
- `GET /users/{handle}` → `PublicProfile` (no measurements, no weight, ever)

```
User = { id, handle, display_name, avatar_url, bio, is_founding_seller,
         has_stripe_account: bool, slice_id, created_at,
         accuracy: { score: float|null, rated_sales: int, badge: bool } }
PublicProfile = { id, handle, display_name, avatar_url, bio, twin_count,
                  listing_count, accuracy_badge: bool }
```

## Body profile
- `GET /me/body` → `BodyProfile`
- `PUT /me/body` body `BodyProfileInput` → `BodyProfile` (partial upsert, only sent fields change)
- `GET /me/body/match-count?<same fields as BodyProfileInput as query>` → `{ match_count: int }`
  Used by the measurement form to show live match-count change as fields are typed.

```
BodyProfileInput = {
  height_cm?, usual_size?,            # e.g. "UK 12"
  outseam_cm?, inseam_cm?, rise_cm?, waist_cm?, hip_cm?,
  shoulder_cm?, torso_length_cm?, bust_cm?,   # bust optional at every tier
  source_per_field?: { [field]: "picker" | "garment" | "typed" }
}
BodyProfile = BodyProfileInput & {
  precision_tier: "estimated" | "measured" | "confirmed",
  unlocked: string[],                  # capability framing, e.g. ["exact_fit_scores"]
  next_unlock: string | null,          # never "incomplete"
  updated_at
}
```

## Onboarding pickers
- `POST /me/onboarding/height-size` `{ height_cm, usual_size }` → `BodyProfile` plus `{ slice: SliceStatus }`
- `POST /me/onboarding/body-picker` `{ round: 1|2|3, choice: 0|1|2 }` → `BodyProfile`
  (server derives estimated measurements; fields get source "picker")
- `POST /me/onboarding/style-picker` `{ round: 1..4, choice: 0|1|2 }` → `{ style_vector: number[] }`
- `GET /onboarding/body-picker/{round}` → `{ round, prompt, options: [{ index, image_url, consent_id }] }`
- `GET /onboarding/style-picker/{round}` → same shape

## Listings
- `GET /listings/{id}` → `Listing` (public)
- `POST /listings` body `ListingInput` → `Listing` (status `draft`)
- `PATCH /listings/{id}` → `Listing`
- `POST /listings/{id}/publish` → `Listing` (validates required measurement fields for category; 422 otherwise)
- `DELETE /listings/{id}` → sets status `removed`
- `GET /me/listings` → `Listing[]`
- `GET /users/{handle}/listings` → `Listing[]` (live only)
- `POST /uploads/sign` `{ content_type }` → `{ upload_url, public_url }` (presigned PUT)

```
Category = "bottoms" | "tops" | "dresses"
ListingInput = {
  title, description?, category: Category, brand?, size_label, price_pence,
  photos: [{ url, is_modelled_fit: bool }],   # first must have is_modelled_fit=true to publish
  measurements: {
    outseam_cm?, inseam_cm?, rise_cm?, waist_flat_cm?, hip_flat_cm?,
    pit_to_pit_cm?, shoulder_flat_cm?, length_cm?
  }
}
Required to publish: bottoms → outseam, inseam, rise, waist_flat.
                     tops → pit_to_pit, shoulder_flat, length.
                     dresses → shoulder_flat, length, waist_flat.
Listing = ListingInput & { id, seller: PublicProfile, status, created_at,
                           match?: FitMatch }   # present when caller has a body profile
FitMatch = { fit_score: int, fit_confidence: float 0..1, style_score: int,
             fields_used: string[], reason: "twin"|"following"|"match" }
```

## Feed
- `GET /feed?cursor=&limit=` → `{ twins: FeedCard[], items: FeedCard[], next_cursor }`
```
FeedCard = { listing: Listing, fit_score, fit_confidence, style_score, reason }
```

## Follows / twins
- `POST /users/{id}/follow`, `DELETE /users/{id}/follow`
- `GET /me/following` → `PublicProfile[]`
- `GET /me/twins` → `{ twins: PublicProfile[], count }`

## Orders / checkout
- `POST /orders/quote` `{ listing_id }` → `Quote`
- `POST /orders` `{ listing_id }` → `{ order: Order, payment: { client_secret, publishable_key } }`
- `GET /me/orders?role=buyer|seller` → `Order[]`
- `GET /orders/{id}` → `Order`
- `POST /orders/{id}/ship` `{ tracking_ref? }` (seller) → `Order`
- `POST /orders/{id}/deliver` (buyer confirms, or carrier webhook) → `Order`
- `POST /orders/{id}/refund` (buyer, only after failed fit rating) → `Order`
- `POST /orders/{id}/relist` (buyer, one tap: creates a new draft listing cloned from the original) → `Listing`
- `POST /webhooks/stripe` (no auth; Stripe signature verified)

```
Quote = { item_pence, protection_fee_pence, shipping_pence, total_pence,
          protection_fee_waived: bool, waived_reason: string|null }
Order = { id, listing: Listing, buyer_id, seller_id, amount_pence, protection_fee_pence,
          shipping_pence, status: "pending"|"paid"|"shipped"|"delivered"|"released"|"refunded",
          auto_release_at, created_at, fit_rating: FitRating|null }
```

## Fit rating (private)
- `POST /orders/{id}/fit-rating` `{ fit_as_described: bool, issues?: Issue[] }` → `FitRating`
```
Issue = "too_short" | "too_long" | "waist_tight" | "waist_loose" | "hip_tight" | "hip_loose"
      | "shoulders_tight" | "shoulders_loose" | "chest_tight" | "chest_loose" | "other"
FitRating = { order_id, fit_as_described, issues, created_at, became_twins: bool }
```
Fit ratings are never returned on any public endpoint.

## Me / seller accuracy (private to seller)
- `GET /me/accuracy` → `{ score, rated_sales, badge, tier: "new"|"good"|"high"|"needs_attention",
                          private_prompt: string|null }`

## Slices / waitlist (public)
- `GET /slices/resolve?height_cm=&usual_size=` → `SliceStatus`
- `POST /waitlist` `{ email, height_cm, usual_size, referral_code? }` → `{ position, slice: SliceStatus, referral_code }`
```
SliceStatus = { slice_id, is_open, progress: float 0..1, member_count, member_target }
```

## Errors
`{ "detail": string | [{ loc, msg, type }] }` with conventional HTTP codes. 402 is used
when a listing is no longer purchasable, 409 for invalid state transitions.
