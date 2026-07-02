import pool from '../db/connection.js';
import { type Request, type Response } from 'express';

export async function getTripAdminAudit(req: Request, res: Response): Promise<void> {
  const stateEntityId = req.user!.entityId;
  const { tripAdminId, dateFrom, dateTo, status } = req.query;

  if (!stateEntityId) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'No entity scope found for this user' });
    return;
  }

  try {
    const emptySummary = {
      totalTrips: 0, completed: 0, cancelled: 0, inTransit: 0, created: 0,
      cancellationPending: 0, totalRevenue: 0,
      directCancellations: 0, approvalCancellations: 0, approvalApproved: 0, approvalRejected: 0,
    };

    // ── Step 1: validate single-TA scope if requested ────────────────────
    if (tripAdminId && typeof tripAdminId === 'string') {
      const checkRes = await pool.query(
        `SELECT id FROM users
         WHERE id = $1 AND entity_id = $2 AND role = 'trip_admin' AND deleted_at IS NULL`,
        [tripAdminId, stateEntityId],
      );
      if (checkRes.rows.length === 0) {
        res.status(403).json({
          error: 'FORBIDDEN',
          message: 'The requested Trip Admin does not belong to your state.',
        });
        return;
      }
    }

    // ── Step 2: Trip Admins in scope ──────────────────────────────────────
    const taParams: unknown[] = [stateEntityId, 'trip_admin'];
    let taWhere = 'u.entity_id = $1 AND u.role = $2 AND u.deleted_at IS NULL';
    if (tripAdminId && typeof tripAdminId === 'string') {
      taParams.push(tripAdminId);
      taWhere += ` AND u.id = $${taParams.length}`;
    }

    const taRes = await pool.query(
      `SELECT u.id,
              u.email,
              u.first_name,
              u.last_name,
              u.can_cancel_without_approval,
              u.created_at AS date_onboarded
       FROM users u
       WHERE ${taWhere}
       ORDER BY u.first_name, u.last_name, u.email`,
      taParams,
    );

    if (taRes.rows.length === 0) {
      res.json({ data: { tripAdmins: [], summary: emptySummary }, message: 'Trip Admin audit report generated' });
      return;
    }

    const taIds: string[] = taRes.rows.map((ta: any) => ta.id as string);

    // ── Step 3: trips + cancellation_requests in parallel ────────────────
    const tripParams: unknown[] = [taIds];
    let tripWhere = 't.created_by = ANY($1) AND t.deleted_at IS NULL';
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

    const [tripsRes, crRes] = await Promise.all([
      pool.query(
        `SELECT
           t.id,
           t.trip_code,
           t.created_at,
           t.status,
           t.created_by,
           ls.name                           AS loading_state,
           us.name                           AS unloading_state,
           v.registration_number             AS vehicle_reg,
           COALESCE(SUM(tf.amount), 0)::bigint AS total_fees
         FROM trips t
         LEFT JOIN states    ls ON t.loading_state_id   = ls.id
         LEFT JOIN states    us ON t.unloading_state_id = us.id
         LEFT JOIN vehicles   v ON t.vehicle_id          = v.id
         LEFT JOIN trip_fees tf ON tf.trip_id             = t.id
         WHERE ${tripWhere}
         GROUP BY t.id, t.trip_code, t.created_at, t.status, t.created_by,
                  ls.name, us.name, v.registration_number
         ORDER BY t.created_at DESC`,
        tripParams,
      ),
      // full cancellation history, unfiltered by date/status
      pool.query(
        `SELECT cr.requested_by, cr.status
         FROM cancellation_requests cr
         WHERE cr.requested_by = ANY($1)`,
        [taIds],
      ),
    ]);

    // ── Step 4: group trips by TA ─────────────────────────────────────────
    type TripRow = (typeof tripsRes.rows)[number];
    const tripsByTA = new Map<string, TripRow[]>();
    taIds.forEach((id) => tripsByTA.set(id, []));
    for (const trip of tripsRes.rows) {
      tripsByTA.get(trip.created_by)?.push(trip);
    }

    // aggregate cancellation_requests per TA
    const crByTA = new Map<string, { total: number; approved: number; rejected: number }>();
    taIds.forEach((id) => crByTA.set(id, { total: 0, approved: 0, rejected: 0 }));
    for (const cr of crRes.rows) {
      const entry = crByTA.get(cr.requested_by);
      if (!entry) continue;
      entry.total++;
      if (cr.status === 'approved') entry.approved++;
      if (cr.status === 'rejected') entry.rejected++;
    }

    const tripAdmins = taRes.rows.map((ta: any) => {
      const trips    = tripsByTA.get(ta.id) ?? [];
      const crCounts = crByTA.get(ta.id) ?? { total: 0, approved: 0, rejected: 0 };
      const cancelled = trips.filter((t) => t.status === 'cancelled').length;
      const summary = {
        totalTrips:            trips.length,
        completed:             trips.filter((t) => t.status === 'completed').length,
        cancelled,
        inTransit:             trips.filter((t) => t.status === 'in_transit').length,
        created:               trips.filter((t) => t.status === 'created').length,
        cancellationPending:   trips.filter((t) => t.status === 'cancellation_pending').length,
        totalRevenue:          trips.reduce((s: number, t) => s + Number(t.total_fees), 0),
        directCancellations:   Math.max(0, cancelled - crCounts.approved),
        approvalCancellations: crCounts.total,
        approvalApproved:      crCounts.approved,
        approvalRejected:      crCounts.rejected,
      };
      return {
        id:                       ta.id,
        email:                    ta.email         as string,
        firstName:                ta.first_name    as string,
        lastName:                 ta.last_name     as string,
        canCancelWithoutApproval: ta.can_cancel_without_approval as boolean,
        dateOnboarded:            ta.date_onboarded,
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

    // ── Step 5: combined summary across all TAs ────────────────────────────
    type TA = (typeof tripAdmins)[0];
    const summary = {
      totalTrips:            tripAdmins.reduce((s: number, ta: TA) => s + ta.summary.totalTrips, 0),
      completed:             tripAdmins.reduce((s: number, ta: TA) => s + ta.summary.completed, 0),
      cancelled:             tripAdmins.reduce((s: number, ta: TA) => s + ta.summary.cancelled, 0),
      inTransit:             tripAdmins.reduce((s: number, ta: TA) => s + ta.summary.inTransit, 0),
      created:               tripAdmins.reduce((s: number, ta: TA) => s + ta.summary.created, 0),
      cancellationPending:   tripAdmins.reduce((s: number, ta: TA) => s + ta.summary.cancellationPending, 0),
      totalRevenue:          tripAdmins.reduce((s: number, ta: TA) => s + ta.summary.totalRevenue, 0),
      directCancellations:   tripAdmins.reduce((s: number, ta: TA) => s + ta.summary.directCancellations, 0),
      approvalCancellations: tripAdmins.reduce((s: number, ta: TA) => s + ta.summary.approvalCancellations, 0),
      approvalApproved:      tripAdmins.reduce((s: number, ta: TA) => s + ta.summary.approvalApproved, 0),
      approvalRejected:      tripAdmins.reduce((s: number, ta: TA) => s + ta.summary.approvalRejected, 0),
    };

    res.json({
      data: { tripAdmins, summary },
      message: 'Trip Admin audit report generated',
    });
  } catch (err) {
    console.error('[auditController] getTripAdminAudit error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to generate trip admin audit report' });
  }
}

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
