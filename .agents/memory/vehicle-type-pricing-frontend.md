---
name: Vehicle-type pricing frontend
description: How the Expo mobile app handles vehicle-type-based pricing after the backend migration from state-based rates.
---

## Key decisions

**Trip creation (tripadmin/index.tsx)**
- Loading state locked to `user.entityId` (Trip Admin's own state) — read-only, pre-filled in `handleOpenModal`. Use `useAuthContext()` from `@/app/_layout`, NOT `useAuth()` from hooks (avoids second AsyncStorage read).
- No fees object sent on trip creation (`createTrip` body is just vehicleId/driverId/loadingStateId/unloadingStateId/descriptions).
- Fee preview section shows loading fee + unloading fee + stakeholder rates from `pricing.vehicleTypeRates.find(r => r.vehicleTypeId === selectedVehicle.vehicleTypeId)`.
- Inline vehicle registration: when `onRegisterNew(regNum)` is called, set `pendingRegNum` and show an inline type-picker step (list of vehicle type buttons) instead of registering immediately. On confirm, call `createVehicle({registrationNumber, vehicleTypeId})`.

**Vehicle registration (tripadmin/vehicles.tsx)**
- Same two-step flow in the register modal: `onRegisterNew` → sets `pendingRegNum` → show type picker → confirm → `createVehicle({registrationNumber, vehicleTypeId})`.
- vehicleTypeName shown as subtitle on vehicle list cards.

**Pricing config (superadmin/config.tsx)**
- Removed: State Loading & Unloading Rates section, Create New Chart form, PendingChartCard, all state-rate handlers.
- New ActiveChartCard shows 7 vehicle type expandable cards (tap to see loadingFee + unloadingFee + stakeholderRates per type).
- Set Rate modal for unassigned stakeholders now requires a vehicleTypeId picker (rate is per vehicle type). `addStakeholderRate` now takes `{stakeholderId, vehicleTypeId, amount}`.

**API changes**
- `listVehicleTypes()` — `GET /api/vehicle-types`, no auth required.
- `createVehicle(body: {registrationNumber, vehicleTypeId})` — was just a string.
- `addStakeholderRate(chartId, {stakeholderId, vehicleTypeId, amount})` — vehicleTypeId added.
- `updateVehicle(id, {registrationNumber, vehicleTypeId?})` — vehicleTypeId optional.

**TripDetailView**
- `TripDetail` interface has optional `vehicleTypeId?` and `vehicleTypeName?`.
- vehicleTypeName shown below vehicleNumber in header card.
- Stakeholder fee filter: `feeType === 'stakeholder' || feeType === 'stakeholder_fee'` (backend changed to stakeholder_fee).

**Why:**
Backend replaced states.loading_rate/unloading_rate with a vehicle_types table + pricing_chart_stakeholder_rates(vehicle_type_id). Fees are now determined at trip completion by the vehicle type, not at creation time by the state.
