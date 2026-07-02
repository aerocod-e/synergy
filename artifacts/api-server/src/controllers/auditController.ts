import pool from '../db/connection.js';
import { type Request, type Response } from 'express';

export async function getDriverAudit(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const { driverId, dateFrom, dateTo, status } = req.query;

  try {
    // ── Step 1: drivers owned by this Trip Admin ──────────────────────────
    const driverParams: unknown[] = [userId];
    let driverWhere = 'd.created_by = $1 AND d.deleted_at IS NULL';

    if (driverId && typeof driverId === 'string') {
      driverParams.push(driverId);
      driverWhere += ` AND d.id = $${driverParams.length}`;
    }

    const driversRes = await pool.query(
      `SELECT d.id,
              d.full_name,
              d.license_number,
              d.phone_number,
              d.created_at AS date_registered
       FROM drivers d
       WHERE ${driverWhere}
       ORDER BY d.full_name`,
      driverParams,
    );

    if (driversRes.rows.length === 0) {
      const empty = { totalTrips: 0, completed: 0, cancelled: 0, inTransit: 0, created: 0, cancellationPending: 0, totalRevenue: 0 };
      res.json({ data: { drivers: [], summary: empty }, message: 'Driver audit report generated' });
      return;
    }

    const driverIds: string[] = driversRes.rows.map((d: any) => d.id as string);

    // ── Step 2: trips for these drivers ──────────────────────────────────
    const tripParams: unknown[] = [driverIds];
    let tripWhere = 't.driver_id = ANY($1) AND t.deleted_at IS NULL';
    let paramIdx = 2;

    if (dateFrom && typeof dateFrom === 'string') {
      tripParams.push(new Date(dateFrom));
      tripWhere += ` AND t.created_at >= $${paramIdx++}`;
    }
    if (dateTo && typeof dateTo === 'string') {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      tripParams.push(to);
      tripWhere += ` AND t.created_at <= $${paramIdx++}`;
    }
    if (status && typeof status === 'string') {
      tripParams.push(status);
      tripWhere += ` AND t.status = $${paramIdx++}`;
    }

    const tripsRes = await pool.query(
      `SELECT
         t.id,
         t.trip_code,
         t.created_at,
         t.status,
         t.driver_id,
         ls.name                   AS loading_state,
         us.name                   AS unloading_state,
         v.registration_number     AS vehicle_reg,
         COALESCE(SUM(tf.amount), 0)::bigint AS total_fees
       FROM trips t
       LEFT JOIN states    ls ON t.loading_state_id   = ls.id
       LEFT JOIN states    us ON t.unloading_state_id = us.id
       LEFT JOIN vehicles   v ON t.vehicle_id          = v.id
       LEFT JOIN trip_fees tf ON tf.trip_id             = t.id
       WHERE ${tripWhere}
       GROUP BY t.id, t.trip_code, t.created_at, t.status, t.driver_id,
                ls.name, us.name, v.registration_number
       ORDER BY t.created_at DESC`,
      tripParams,
    );

    // ── Step 3: group trips by driver ────────────────────────────────────
    type TripRow = (typeof tripsRes.rows)[number];
    const tripsByDriver = new Map<string, TripRow[]>();
    driverIds.forEach((id) => tripsByDriver.set(id, []));
    for (const trip of tripsRes.rows) {
      tripsByDriver.get(trip.driver_id)?.push(trip);
    }

    const drivers = driversRes.rows.map((d: any) => {
      const trips = tripsByDriver.get(d.id) ?? [];
      const summary = {
        totalTrips:          trips.length,
        completed:           trips.filter((t) => t.status === 'completed').length,
        cancelled:           trips.filter((t) => t.status === 'cancelled').length,
        inTransit:           trips.filter((t) => t.status === 'in_transit').length,
        created:             trips.filter((t) => t.status === 'created').length,
        cancellationPending: trips.filter((t) => t.status === 'cancellation_pending').length,
        totalRevenue:        trips.reduce((s: number, t) => s + Number(t.total_fees), 0),
      };
      return {
        id:             d.id,
        fullName:       d.full_name   as string,
        licenseNumber:  d.license_number as string,
        phoneNumber:    d.phone_number as string,
        dateRegistered: d.date_registered,
        summary,
        trips: trips.map((t) => ({
          id:             t.id,
          tripCode:       t.trip_code,
          date:           t.created_at,
          loadingState:   t.loading_state   ?? null,
          unloadingState: t.unloading_state  ?? null,
          status:         t.status,
          vehicleReg:     t.vehicle_reg      ?? null,
          totalFees:      Number(t.total_fees),
        })),
      };
    });

    // ── Step 4: combined summary across all drivers ───────────────────────
    type D = (typeof drivers)[0];
    const summary = {
      totalTrips:          drivers.reduce((s: number, d: D) => s + d.summary.totalTrips, 0),
      completed:           drivers.reduce((s: number, d: D) => s + d.summary.completed, 0),
      cancelled:           drivers.reduce((s: number, d: D) => s + d.summary.cancelled, 0),
      inTransit:           drivers.reduce((s: number, d: D) => s + d.summary.inTransit, 0),
      created:             drivers.reduce((s: number, d: D) => s + d.summary.created, 0),
      cancellationPending: drivers.reduce((s: number, d: D) => s + d.summary.cancellationPending, 0),
      totalRevenue:        drivers.reduce((s: number, d: D) => s + d.summary.totalRevenue, 0),
    };

    res.json({
      data: { drivers, summary },
      message: 'Driver audit report generated',
    });
  } catch (err) {
    console.error('[auditController] getDriverAudit error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to generate driver audit report' });
  }
}

export async function getVehicleAudit(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const { vehicleId, dateFrom, dateTo, status } = req.query;

  try {
    // ── Step 1: vehicles scoped to this Trip Admin ─────────────────────────
    const vehicleParams: unknown[] = [userId];
    let vehicleWhere = 'v.created_by = $1 AND v.deleted_at IS NULL';

    if (vehicleId && typeof vehicleId === 'string') {
      vehicleParams.push(vehicleId);
      vehicleWhere += ` AND v.id = $${vehicleParams.length}`;
    }

    const vehiclesRes = await pool.query(
      `SELECT v.id,
              v.registration_number,
              vt.name  AS vehicle_type_name,
              v.created_at AS date_registered
       FROM vehicles v
       LEFT JOIN vehicle_types vt ON v.vehicle_type_id = vt.id
       WHERE ${vehicleWhere}
       ORDER BY v.registration_number`,
      vehicleParams,
    );

    if (vehiclesRes.rows.length === 0) {
      const empty = { totalTrips: 0, completed: 0, cancelled: 0, inTransit: 0, created: 0, cancellationPending: 0, totalRevenue: 0 };
      res.json({ data: { vehicles: [], summary: empty }, message: 'Vehicle audit report generated' });
      return;
    }

    const vehicleIds: string[] = vehiclesRes.rows.map((v: any) => v.id as string);

    // ── Step 2: trips with aggregated fees for all in-scope vehicles ───────
    const tripParams: unknown[] = [vehicleIds];
    let tripWhere = 't.vehicle_id = ANY($1) AND t.deleted_at IS NULL';
    let paramIdx = 2;

    if (dateFrom && typeof dateFrom === 'string') {
      tripParams.push(new Date(dateFrom));
      tripWhere += ` AND t.created_at >= $${paramIdx++}`;
    }
    if (dateTo && typeof dateTo === 'string') {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      tripParams.push(to);
      tripWhere += ` AND t.created_at <= $${paramIdx++}`;
    }
    if (status && typeof status === 'string') {
      tripParams.push(status);
      tripWhere += ` AND t.status = $${paramIdx++}`;
    }

    const tripsRes = await pool.query(
      `SELECT
         t.id,
         t.trip_code,
         t.created_at,
         t.status,
         t.vehicle_id,
         ls.name  AS loading_state,
         us.name  AS unloading_state,
         d.full_name AS driver_name,
         COALESCE(SUM(tf.amount), 0)::bigint AS total_fees
       FROM trips t
       LEFT JOIN states    ls ON t.loading_state_id   = ls.id
       LEFT JOIN states    us ON t.unloading_state_id = us.id
       LEFT JOIN drivers    d ON t.driver_id           = d.id
       LEFT JOIN trip_fees tf ON tf.trip_id            = t.id
       WHERE ${tripWhere}
       GROUP BY t.id, t.trip_code, t.created_at, t.status, t.vehicle_id,
                ls.name, us.name, d.full_name
       ORDER BY t.created_at DESC`,
      tripParams,
    );

    // ── Step 3: group trips by vehicle ─────────────────────────────────────
    type TripRow = (typeof tripsRes.rows)[number];
    const tripsByVehicle = new Map<string, TripRow[]>();
    vehicleIds.forEach((id) => tripsByVehicle.set(id, []));
    for (const trip of tripsRes.rows) {
      tripsByVehicle.get(trip.vehicle_id)?.push(trip);
    }

    const vehicles = vehiclesRes.rows.map((v: any) => {
      const trips = tripsByVehicle.get(v.id) ?? [];
      const summary = {
        totalTrips:           trips.length,
        completed:            trips.filter((t) => t.status === 'completed').length,
        cancelled:            trips.filter((t) => t.status === 'cancelled').length,
        inTransit:            trips.filter((t) => t.status === 'in_transit').length,
        created:              trips.filter((t) => t.status === 'created').length,
        cancellationPending:  trips.filter((t) => t.status === 'cancellation_pending').length,
        totalRevenue:         trips.reduce((s, t) => s + Number(t.total_fees), 0),
      };
      return {
        id:               v.id,
        registrationNumber: v.registration_number,
        vehicleTypeName:  v.vehicle_type_name ?? null,
        dateRegistered:   v.date_registered,
        summary,
        trips: trips.map((t) => ({
          id:             t.id,
          tripCode:       t.trip_code,
          date:           t.created_at,
          loadingState:   t.loading_state  ?? null,
          unloadingState: t.unloading_state ?? null,
          status:         t.status,
          driverName:     t.driver_name     ?? null,
          totalFees:      Number(t.total_fees),
        })),
      };
    });

    // ── Step 4: combined summary across all vehicles ────────────────────────
    type V = (typeof vehicles)[0];
    const summary = {
      totalTrips:          vehicles.reduce((s: number, v: V) => s + v.summary.totalTrips, 0),
      completed:           vehicles.reduce((s: number, v: V) => s + v.summary.completed, 0),
      cancelled:           vehicles.reduce((s: number, v: V) => s + v.summary.cancelled, 0),
      inTransit:           vehicles.reduce((s: number, v: V) => s + v.summary.inTransit, 0),
      created:             vehicles.reduce((s: number, v: V) => s + v.summary.created, 0),
      cancellationPending: vehicles.reduce((s: number, v: V) => s + v.summary.cancellationPending, 0),
      totalRevenue:        vehicles.reduce((s: number, v: V) => s + v.summary.totalRevenue, 0),
    };

    res.json({
      data: { vehicles, summary },
      message: 'Vehicle audit report generated',
    });
  } catch (err) {
    console.error('[auditController] getVehicleAudit error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to generate audit report' });
  }
}
