/**
 * Typed fetch wrapper: attaches the access token, transparently refreshes it once on 401
 * (single-flight, so parallel requests share one refresh), and normalises API errors.
 */
import type { AuthResponse } from '@masar/shared';
import { useAuth, type ClientApp } from './auth-store';

let APP: ClientApp = 'passenger';
const BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';

export function configureApi(app: ClientApp) {
  APP = app;
}
export const clientApp = () => APP;
export const apiBase = () => BASE;

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

let refreshing: Promise<string | null> | null = null;

export async function refreshSession(): Promise<string | null> {
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const res = await fetch(`${BASE}/api/auth/refresh`, { method: 'POST', credentials: 'include', headers: { 'X-Client-App': APP } });
        if (!res.ok) {
          useAuth.getState().clear();
          return null;
        }
        const data = (await res.json()) as AuthResponse;
        useAuth.getState().setSession(data.user, data.accessToken);
        return data.accessToken;
      } catch {
        return null;
      } finally {
        setTimeout(() => (refreshing = null), 0);
      }
    })();
  }
  return refreshing;
}

type Body = Record<string, unknown> | unknown[] | FormData | undefined;

async function request<T>(method: string, path: string, body?: Body, opts: { headers?: Record<string, string>; retry?: boolean } = {}): Promise<T> {
  const token = useAuth.getState().accessToken;
  const headers: Record<string, string> = { 'X-Client-App': APP, ...opts.headers };
  if (token) headers.Authorization = `Bearer ${token}`;
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(`${BASE}/api${path}`, {
      method,
      headers,
      credentials: 'include',
      body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'You appear to be offline. Check your connection and try again.');
  }

  if (res.status === 401 && opts.retry !== false && !path.startsWith('/auth/')) {
    const fresh = await refreshSession();
    if (fresh) return request<T>(method, path, body, { ...opts, retry: false });
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = (data as any)?.error ?? {};
    throw new ApiError(res.status, err.code ?? 'ERROR', err.message ?? `Request failed (${res.status})`, err.details);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: Body, headers?: Record<string, string>) => request<T>('POST', path, body ?? {}, { headers }),
  put: <T>(path: string, body?: Body) => request<T>('PUT', path, body ?? {}),
  patch: <T>(path: string, body?: Body) => request<T>('PATCH', path, body ?? {}),
  del: <T>(path: string) => request<T>('DELETE', path),
};

export async function logout() {
  try {
    await fetch(`${BASE}/api/auth/logout`, { method: 'POST', credentials: 'include', headers: { 'X-Client-App': APP } });
  } finally {
    useAuth.getState().clear();
  }
}

/** Builds a URL for an authorised file (documents/avatars) usable in <img src>. */
export function fileUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  if (/^https?:/.test(path)) return path;
  const token = useAuth.getState().accessToken;
  return `${BASE}${path}${token ? `?token=${encodeURIComponent(token)}` : ''}`;
}
