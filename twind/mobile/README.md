# Twind mobile

Expo (SDK 52) + React Native + TypeScript app for Twind, the peer-to-peer secondhand
clothing marketplace that matches buyers and sellers by body measurements.

Every screen is built against `../docs/api-contract.md` (paths, field names, response
shapes). `src/api/types.ts` mirrors that contract one-to-one.

## Run

```bash
npm install
npx expo start          # then press i / a, or scan the QR code with Expo Go
npx tsc --noEmit        # strict type-check
```

Stripe's Payment Sheet needs a native build (`npx expo run:ios` / `run:android` or an
EAS `development` build); in Expo Go the app still runs, with payments disabled.

## Environment

Copy `.env.example` to `.env`:

| Variable                             | Default                 | Purpose                                                         |
| ------------------------------------ | ----------------------- | --------------------------------------------------------------- |
| `EXPO_PUBLIC_API_URL`                | `http://localhost:8000` | API origin; the app appends `/v1`.                              |
| `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` | *(empty)*               | Stripe key. Empty = payments disabled, checkout still testable. |

Auth is a pluggable adapter (`src/lib/auth.ts`). The shipped `devAuthAdapter` calls
`${API_URL}/v1/dev/token?email=` and stores the returned JWT in `expo-secure-store`.
Swap in Supabase/Clerk with `setAuthAdapter(...)` at startup.

EAS profiles (`eas.json`): `development` (dev client), `preview` (internal), `production`.
`app.json` registers the `twind://` scheme and `twind.app` universal links / app links.

## Folder map

```
app/                          Expo Router (file-based routes)
  _layout.tsx                 QueryClientProvider, Stripe provider, auth + onboarding gate
  (auth)/sign-in.tsx          Email/phone OTP, 18+ checkbox
  (onboarding)/style.tsx      4 rounds x 3 images, skippable
  (onboarding)/height-size.tsx  Two scroll pickers (no skip)
  (onboarding)/body.tsx       3 rounds x 3 shapes, skippable, link to /measurements
  (onboarding)/waitlist.tsx   Slice closed: progress bar + referral share
  (tabs)/index.tsx            Feed: "Your twins" strip, then ranked list
  (tabs)/sell.tsx             Listing creation (single scroll)
  (tabs)/profile.tsx          Own profile, measurements, listings, twins
  listing/[id].tsx            Listing detail, Fit % and Style % badges, Buy
  checkout/[listingId].tsx    Quote breakdown + Stripe payment sheet
  orders/index.tsx, orders/[id].tsx
  fit-rating/[orderId].tsx    Private "did it fit?"
  measurements.tsx            Garment measurement form with live match count
  settings.tsx
src/
  api/client.ts               fetch wrapper: base URL, bearer token, ApiError/NetworkError
  api/types.ts                Types mirroring the contract
  api/hooks/*.ts              TanStack Query hooks per resource
  store/ui.ts                 Zustand: onboarding progress, picker choices, listing draft
  lib/auth.ts                 Auth adapter + secure token storage
  lib/fees.ts                 Display-only fee helpers (server quote is authoritative)
  lib/format.ts               pence -> £, cm formatting, labels
  lib/stripe.tsx              Stripe provider/payment sheet wrapper (works with no key)
  lib/notifications.ts        expo-notifications registration
  components/                 FeedCard, ScoreBadge, ReasonTag, MeasurementField, ScrollPicker,
                              PhotoGrid, PrecisionBanner, PickerOptions, ui primitives
  theme.ts                    Colours, spacing, type
```

## Product rules encoded in the UI

- **Fit % and Style % are always two separate badges.** `ScoreBadge` takes
  `kind: "fit" | "style"` and renders one score; nothing averages or combines them.
- **Reason tags.** Each feed card shows `twin` or `following`; plain matches show nothing.
- **Fit confidence is visible.** The 0..1 `fit_confidence` renders as confidence dots and,
  when `fields_used` is present, "based on N of M measurements".
- **Measurement form is garment-first.** All fields optional and individually typeable;
  picker estimates are prefilled and labelled "estimate"; copy asks for garment
  measurements ("measure your best-fitting jeans, waistband to hem"), never body
  measurements. Typing debounces a call to `GET /me/body/match-count` for a live
  "N items match you" figure.
- **No weight, anywhere.** Bust/chest is optional and marked so.
- **Precision is framed as capability unlocked** ("Add inseam to unlock exact fit
  scores"), never "profile incomplete" (`PrecisionBanner`).
- **Listing creation:** photos first; the first photo has a required "This photo shows
  the item worn (modelled fit photo)" toggle; category, brand, size label, price; then
  category-specific garment measurements that are required before publish
  (bottoms: outseam, inseam, rise, waist_flat; tops: pit_to_pit, shoulder_flat, length;
  dresses: shoulder_flat, length, waist_flat) with inline validation and 422 mapping.
- **Fit rating is private.** Copy on the rating screen and order page states it is never
  shown as a public review.
- **Checkout** shows item, protection fee (with "Waived" state + reason), shipping, total,
  straight from `POST /orders/quote`.
- **Age gate.** Sign-in requires an 18+ confirmation checkbox.
- **Picker images** come from the API's `image_url`; empty URLs render a neutral
  placeholder. No real people's photos are bundled.
