/**
 * Typed fetch wrapper for the Quotas plugin admin tab + a thin Role helper that talks to the
 * core admin API. Both /api/admin/* and /api/plugins/* sit behind Oscarr's CSRF gate, which
 * insists on the `X-Requested-With: oscarr` header — keep it on every call.
 */

const CSRF_HEADERS = { 'X-Requested-With': 'oscarr' } as const;

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  // Only send Content-Type when there's actually a body to parse — otherwise Fastify
  // tries to parse an empty payload as JSON and rejects the request with HTTP 400
  // ("Unexpected end of JSON input"), which bites every DELETE call.
  const headers: Record<string, string> = {
    ...CSRF_HEADERS,
    ...(init.body !== undefined && init.body !== null ? { 'Content-Type': 'application/json' } : {}),
    ...(init.headers as Record<string, string> | undefined),
  };
  const res = await fetch(path, {
    credentials: 'include',
    ...init,
    headers,
  });
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json() as { error?: string };
      if (body.error) message = body.error;
    } catch { /* response wasn't JSON, fall back to status text */ }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export type WindowUnit = 'hour' | 'day' | 'week' | 'month';
export type TvCountMode = 'series' | 'season';

export interface Policy {
  id: string;
  name: string;
  roleName: string | null;
  windowUnit: WindowUnit;
  windowValue: number;
  maxMovies: number | null;
  maxTvShows: number | null;
  tvCountMode: TvCountMode;
  createdAt: string;
  updatedAt: string;
}

export interface Override {
  userId: number;
  policyId: string;
  expiresAt: string | null;
}

export interface AdminUser {
  id: number;
  email: string;
  displayName: string | null;
  role: string;
}

export interface Role {
  name: string;
}

export interface Usage {
  movies: number;
  tvShows: number;
  earliestAt: string | null;
}

export const api = {
  listPolicies: () => request<{ policies: Policy[] }>('/api/plugins/quotas/policies'),
  createPolicy: (body: Omit<Policy, 'id' | 'createdAt' | 'updatedAt'>) =>
    request<{ policy: Policy }>('/api/plugins/quotas/policies', { method: 'POST', body: JSON.stringify(body) }),
  updatePolicy: (id: string, body: Partial<Policy>) =>
    request<{ policy: Policy }>(`/api/plugins/quotas/policies/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deletePolicy: (id: string) =>
    request<{ ok: boolean }>(`/api/plugins/quotas/policies/${id}`, { method: 'DELETE' }),
  listOverrides: () => request<{ overrides: Override[] }>('/api/plugins/quotas/overrides'),
  upsertOverride: (body: { userId: number; policyId: string; expiresAt?: string | null }) =>
    request<{ override: Override }>('/api/plugins/quotas/overrides', { method: 'PUT', body: JSON.stringify(body) }),
  removeOverride: (userId: number) =>
    request<{ ok: boolean }>(`/api/plugins/quotas/overrides/${userId}`, { method: 'DELETE' }),
  getUsage: (userId: number) =>
    request<{ policy: Policy | null; usage: Usage | null }>(`/api/plugins/quotas/usage?userId=${userId}`),
};

export async function fetchUsers(): Promise<AdminUser[]> {
  const data = await request<AdminUser[] | { users?: AdminUser[] }>('/api/admin/users');
  return Array.isArray(data) ? data : data.users ?? [];
}

export async function fetchRoles(): Promise<Role[]> {
  return request<Role[]>('/api/admin/roles');
}
