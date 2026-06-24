export type UserRole = 'super_admin' | 'state_admin' | 'trip_admin' | 'stakeholder';

export type EntityType = 'state' | 'stakeholder' | null;

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  entityType: EntityType;
  entityId: string | null;
  firstName: string;
  lastName: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export type TripStatus = 'created' | 'in_transit' | 'completed' | 'cancelled' | 'cancellation_pending';

export type FeeType = 'loading' | 'unloading' | 'stakeholder_fee';

export type RecipientType = 'state' | 'stakeholder';

export interface Trip {
  id: string;
  vehicleNumber: string;
  status: TripStatus;
  loadingState: { id: string; name: string; code: string };
  unloadingState: { id: string; name: string; code: string };
  driver: { id: string; email: string };
  originDescription: string;
  destinationDescription: string;
  unstartedFlag: boolean | null;
  createdAt: string;
  updatedAt: string;
}

export interface WalletLedgerEntry {
  ledgerId: string;
  tripId: string;
  vehicleNumber: string;
  feeType: FeeType;
  amount: number;
  amountNaira: string;
  entryType: 'credit' | 'reversal';
  cleared: boolean;
  clearedAt: string | null;
  createdAt: string;
}

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  entityType: string | null;
  entityId: string | null;
  entityName: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface State {
  id: string;
  name: string;
  code: string;
}

export interface Stakeholder {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
}
