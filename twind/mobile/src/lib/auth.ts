/**
 * Pluggable auth adapter.
 *
 * The API verifies a JWT from an external provider (Supabase Auth / Clerk). The app
 * talks to an `AuthAdapter` so the provider can be swapped without touching screens.
 * A dev adapter is shipped that mints a token from `${API_URL}/v1/dev/token?email=`.
 */
import * as SecureStore from 'expo-secure-store';
import { config } from '../config';

const TOKEN_KEY = 'twind.jwt';

let memoryToken: string | null | undefined; // undefined = not loaded yet
const listeners = new Set<(token: string | null) => void>();

async function secureGet(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}
async function secureSet(key: string, value: string | null): Promise<void> {
  try {
    if (value === null) await SecureStore.deleteItemAsync(key);
    else await SecureStore.setItemAsync(key, value);
  } catch {
    // SecureStore is unavailable on web / some simulators; memory token still works.
  }
}

export async function getToken(): Promise<string | null> {
  if (memoryToken === undefined) memoryToken = await secureGet(TOKEN_KEY);
  return memoryToken;
}

export async function setToken(token: string | null): Promise<void> {
  memoryToken = token;
  await secureSet(TOKEN_KEY, token);
  listeners.forEach((l) => l(token));
}

export function subscribeToken(listener: (token: string | null) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export type OtpChannel = 'email' | 'phone';

export type OtpChallenge = {
  /** Opaque handle the adapter needs to complete verification. */
  challenge_id: string;
  channel: OtpChannel;
  destination: string;
  /** Some adapters (dev) do not need a code; the UI can skip the code step. */
  requires_code: boolean;
};

export interface AuthAdapter {
  readonly name: string;
  /** Start an OTP flow for an email address or phone number. */
  requestOtp(channel: OtpChannel, destination: string): Promise<OtpChallenge>;
  /** Complete the flow. Returns the JWT the API accepts as a Bearer token. */
  verifyOtp(challenge: OtpChallenge, code: string): Promise<string>;
  signOut(): Promise<void>;
}

/**
 * Dev adapter: the backend exposes `GET /v1/dev/token?email=` in non-production
 * environments and returns `{ token }` (or `{ access_token }`). No code is required.
 */
export const devAuthAdapter: AuthAdapter = {
  name: 'dev',
  async requestOtp(channel, destination) {
    const email = channel === 'email' ? destination : `${destination.replace(/\D/g, '')}@phone.twind.dev`;
    return { challenge_id: email, channel, destination, requires_code: false };
  },
  async verifyOtp(challenge) {
    const url = `${config.apiUrl}/v1/dev/token?email=${encodeURIComponent(challenge.challenge_id)}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) {
      throw new Error(`Dev token endpoint returned ${res.status}. Is the API running at ${config.apiUrl}?`);
    }
    const body = (await res.json()) as { token?: string; access_token?: string; jwt?: string };
    const token = body.token ?? body.access_token ?? body.jwt;
    if (!token) throw new Error('Dev token endpoint returned no token');
    await setToken(token);
    return token;
  },
  async signOut() {
    await setToken(null);
  },
};

let activeAdapter: AuthAdapter = devAuthAdapter;

/** Swap in a production adapter (Supabase, Clerk, ...) at app start. */
export function setAuthAdapter(adapter: AuthAdapter): void {
  activeAdapter = adapter;
}

export function getAuthAdapter(): AuthAdapter {
  return activeAdapter;
}

export async function signOut(): Promise<void> {
  await activeAdapter.signOut();
  await setToken(null);
}
