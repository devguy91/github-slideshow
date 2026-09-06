import { config } from '../config';
import { getToken } from '../lib/auth';
import type { ErrorBody, ValidationDetail } from './types';

export class ApiError extends Error {
  readonly status: number;
  readonly detail: string | ValidationDetail[];

  constructor(status: number, detail: string | ValidationDetail[]) {
    super(typeof detail === 'string' ? detail : detail.map((d) => d.msg).join('; ') || `HTTP ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }

  /** Field-level messages for 422 responses, keyed by the last `loc` segment. */
  get fieldErrors(): Record<string, string> {
    if (typeof this.detail === 'string') return {};
    const out: Record<string, string> = {};
    for (const d of this.detail) {
      const key = d.loc[d.loc.length - 1];
      if (key !== undefined) out[String(key)] = d.msg;
    }
    return out;
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }
  /** 402: listing no longer purchasable. */
  get isNotPurchasable(): boolean {
    return this.status === 402;
  }
  /** 409: invalid state transition. */
  get isConflict(): boolean {
    return this.status === 409;
  }
}

export class NetworkError extends Error {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : 'Network request failed');
    this.name = 'NetworkError';
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type QueryParams = Record<string, string | number | boolean | null | undefined>;

type RequestOptions = {
  method?: Method;
  body?: unknown;
  query?: QueryParams;
  /** Skip the bearer token (public endpoints). */
  anonymous?: boolean;
  signal?: AbortSignal;
};

export function buildQuery(query: QueryParams | undefined): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '') continue;
    params.append(k, String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

function isErrorBody(x: unknown): x is ErrorBody {
  return typeof x === 'object' && x !== null && 'detail' in x;
}

/**
 * Typed fetch wrapper. All paths are relative to `${API_URL}/v1`.
 * Throws ApiError for non-2xx responses and NetworkError when fetch itself fails.
 */
export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const url = `${config.apiUrl}/v1${path.startsWith('/') ? path : `/${path}`}${buildQuery(opts.query)}`;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (!opts.anonymous) {
    const token = await getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: opts.signal,
    });
  } catch (e) {
    throw new NetworkError(e);
  }

  const text = await res.text();
  let json: unknown = null;
  if (text.length > 0) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }

  if (!res.ok) {
    const detail = isErrorBody(json) ? json.detail : text || res.statusText || `HTTP ${res.status}`;
    throw new ApiError(res.status, detail);
  }
  return json as T;
}

export const api = {
  get: <T>(path: string, query?: QueryParams, opts?: Omit<RequestOptions, 'method' | 'body' | 'query'>) =>
    request<T>(path, { ...opts, method: 'GET', query }),
  post: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...opts, method: 'POST', body }),
  put: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...opts, method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...opts, method: 'PATCH', body }),
  delete: <T>(path: string, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...opts, method: 'DELETE' }),
};

/** Human-readable message for any thrown value. */
export function errorMessage(e: unknown, fallback = 'Something went wrong'): string {
  if (e instanceof ApiError || e instanceof NetworkError) return e.message || fallback;
  if (e instanceof Error) return e.message || fallback;
  return fallback;
}
