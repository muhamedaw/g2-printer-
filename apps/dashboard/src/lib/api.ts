import { useAuthStore } from '../store/auth.js';

const BASE = '/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = useAuthStore.getState().token;
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
  if (!res.ok) {
    if (res.status === 401) {
      // Token expired or invalid — clear auth and redirect to login
      const { logout } = useAuthStore.getState();
      logout();
      window.location.href = '/login';
    }
    const body = await res.text().catch(() => '');
    throw new Error(`${res.status}: ${body}`);
  }
  const json = (await res.json()) as unknown;
  // Unwrap the standard {data, error} envelope used by all API routes
  if (
    json !== null &&
    typeof json === 'object' &&
    'data' in json &&
    'error' in json
  ) {
    return (json as { data: T }).data;
  }
  return json as T;
}

export const api = {
  get:    <T>(path: string)                => request<T>(path),
  post:   <T>(path: string, body: unknown) => request<T>(path, { method: 'POST',   body: JSON.stringify(body) }),
  put:    <T>(path: string, body: unknown) => request<T>(path, { method: 'PUT',    body: JSON.stringify(body) }),
  delete: <T>(path: string)               => request<T>(path, { method: 'DELETE' }),
};
