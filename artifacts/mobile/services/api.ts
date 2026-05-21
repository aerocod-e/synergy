import { API_BASE_URL } from '@/constants/config';

let accessToken: string | null = null;
let refreshToken: string | null = null;

export function setTokens(access: string, refresh: string): void {
  accessToken = access;
  refreshToken = refresh;
}

export function clearTokens(): void {
  accessToken = null;
  refreshToken = null;
}

export async function apiRequest(
  path: string,
  options: RequestInit = {},
  requiresAuth = true,
): Promise<any> {
  const url = API_BASE_URL + path;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined ?? {}),
  };

  if (requiresAuth && accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  const reqOptions: RequestInit = { ...options, headers };
  const response = await fetch(url, reqOptions);

  if (response.status === 401 && requiresAuth) {
    try {
      const refreshRes = await fetch(API_BASE_URL + '/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!refreshRes.ok) throw new Error('Refresh failed');
      const refreshJson = await refreshRes.json();
      setTokens(refreshJson.data.accessToken, refreshJson.data.refreshToken);

      const retryHeaders = { ...headers, Authorization: `Bearer ${accessToken}` };
      const retryRes = await fetch(url, { ...reqOptions, headers: retryHeaders });
      const retryJson = await retryRes.json();
      if (!retryRes.ok) {
        throw { error: retryJson.error ?? 'REQUEST_FAILED', message: retryJson.message ?? 'Request failed' };
      }
      return retryJson.data;
    } catch {
      clearTokens();
      throw { error: 'AUTH_EXPIRED', message: 'Session expired' };
    }
  }

  const json = await response.json();
  if (!response.ok) {
    throw { error: json.error ?? 'REQUEST_FAILED', message: json.message ?? 'Request failed' };
  }
  return json.data;
}

// ── Auth ────────────────────────────────────────────────────────────────────
export const login = (email: string, password: string) =>
  apiRequest('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }, false);

export const logout = (rt: string) =>
  apiRequest('/api/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken: rt }) });

export const getMe = () => apiRequest('/api/auth/me');

// ── Trips ───────────────────────────────────────────────────────────────────
export const getTrips = (params?: Record<string, string>) =>
  apiRequest('/api/trips' + (params ? '?' + new URLSearchParams(params).toString() : ''));

export const getTripById = (tripId: string) =>
  apiRequest(`/api/trips/${tripId}`);

export const createTrip = (body: unknown) =>
  apiRequest('/api/trips', { method: 'POST', body: JSON.stringify(body) });

export const startTrip = (tripId: string) =>
  apiRequest(`/api/trips/${tripId}/start`, { method: 'PATCH' });

export const completeTrip = (tripId: string) =>
  apiRequest(`/api/trips/${tripId}/complete`, { method: 'PATCH' });

export const cancelTrip = (tripId: string) =>
  apiRequest(`/api/trips/${tripId}/cancel`, { method: 'PATCH' });

// ── Wallets ─────────────────────────────────────────────────────────────────
export const getMyWallet = () =>
  apiRequest('/api/wallets/my');

export const getMyLedger = (params?: Record<string, string>) =>
  apiRequest('/api/wallets/my/ledger' + (params ? '?' + new URLSearchParams(params).toString() : ''));

export const getAllWallets = () =>
  apiRequest('/api/wallets/all');

// ── Lookup ──────────────────────────────────────────────────────────────────
export const lookupVehicle = (vehicleNumber: string) =>
  apiRequest(`/api/lookup/vehicle/${encodeURIComponent(vehicleNumber)}`, {}, false);
