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
    // Step 1: attempt refresh — AUTH_EXPIRED only if the refresh call itself fails
    try {
      const refreshRes = await fetch(API_BASE_URL + '/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!refreshRes.ok) {
        clearTokens();
        throw { error: 'AUTH_EXPIRED', message: 'Session expired' };
      }
      const refreshJson = await refreshRes.json();
      setTokens(refreshJson.data.accessToken, refreshJson.data.refreshToken);
    } catch (err: any) {
      if (err?.error) throw err; // already structured, re-throw as-is
      clearTokens();
      throw { error: 'AUTH_EXPIRED', message: 'Session expired' };
    }

    // Step 2: retry original request with new token; propagate errors normally
    const retryHeaders = { ...headers, Authorization: `Bearer ${accessToken}` };
    const retryRes = await fetch(url, { ...reqOptions, headers: retryHeaders });
    const retryJson = await retryRes.json();
    if (!retryRes.ok) {
      throw { error: retryJson.error ?? 'REQUEST_FAILED', message: retryJson.message ?? 'Request failed' };
    }
    return retryJson.data;
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

export const requestCancellation = (tripId: string, reason: string) =>
  apiRequest(`/api/trips/${tripId}/request-cancellation`, { method: 'PATCH', body: JSON.stringify({ reason }) });

// ── Cancellation Requests (State Admin) ──────────────────────────────────────
export const listCancellationRequests = () =>
  apiRequest('/api/cancellation-requests');

export const approveCancellationRequest = (id: string) =>
  apiRequest(`/api/cancellation-requests/${id}/approve`, { method: 'PATCH' });

export const rejectCancellationRequest = (id: string, rejectionReason: string) =>
  apiRequest(`/api/cancellation-requests/${id}/reject`, { method: 'PATCH', body: JSON.stringify({ rejectionReason }) });

export const updateCancellationRights = (userId: string, canCancelWithoutApproval: boolean) =>
  apiRequest(`/api/users/${userId}/cancellation-rights`, { method: 'PATCH', body: JSON.stringify({ canCancelWithoutApproval }) });

export const toggleUserActive = (userId: string, isActive: boolean) =>
  apiRequest(`/api/users/${userId}/active`, { method: 'PATCH', body: JSON.stringify({ isActive }) });

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

// Public trip search — no auth token attached
export const searchPublicTrips = (q: string) =>
  apiRequest(
    `/api/lookup/trips/search?${new URLSearchParams({ q }).toString()}`,
    {},
    false,
  );

// ── Users (Super Admin / State Admin) ────────────────────────────────────────
export const getUsers = () => apiRequest('/api/users');

export const listTripAdmins = () => apiRequest('/api/users/trip-admins');

export const createUser = (body: unknown) =>
  apiRequest('/api/users', { method: 'POST', body: JSON.stringify(body) });

// ── States (Super Admin) ─────────────────────────────────────────────────────
export const getStates = () => apiRequest('/api/states');

// ── Stakeholders (Super Admin) ───────────────────────────────────────────────
export const getStakeholders = () => apiRequest('/api/stakeholders');

// ── Pricing (Super Admin / Trip Admin) ───────────────────────────────────────
export const getActivePricingChart = () =>
  apiRequest('/api/pricing/active');

export const createPricingChart = (body: unknown) =>
  apiRequest('/api/pricing', { method: 'POST', body: JSON.stringify(body) });

export const updatePricingChart = (id: string, body: unknown) =>
  apiRequest(`/api/pricing/${id}`, { method: 'PUT', body: JSON.stringify(body) });

export const activatePricingChart = (id: string) =>
  apiRequest(`/api/pricing/${id}/activate`, { method: 'POST' });

// ── Vehicles (Trip Admin) ─────────────────────────────────────────────────────
export const listVehicles = () =>
  apiRequest('/api/vehicles');

export const searchVehicles = (q: string) =>
  apiRequest('/api/vehicles/search?' + new URLSearchParams({ q }).toString());

export const createVehicle = (registrationNumber: string) =>
  apiRequest('/api/vehicles', { method: 'POST', body: JSON.stringify({ registrationNumber }) });

export const deleteVehicle = (id: string) =>
  apiRequest(`/api/vehicles/${id}`, { method: 'DELETE' });

// ── Drivers (Trip Admin) ──────────────────────────────────────────────────────
export const listDrivers = () =>
  apiRequest('/api/drivers');

export const searchDrivers = (q: string) =>
  apiRequest('/api/drivers/search?' + new URLSearchParams({ q }).toString());

export const createDriver = (body: { full_name: string; license_number: string; phone_number: string }) =>
  apiRequest('/api/drivers', { method: 'POST', body: JSON.stringify(body) });
