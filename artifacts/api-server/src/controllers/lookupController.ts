import { type Request, type Response } from "express";
import pool from "../db/connection.js";

export async function lookupVehicle(req: Request, res: Response): Promise<void> {
  const { vehicleNumber } = req.params as { vehicleNumber: string };

  try {
    const { rows } = await pool.query<{
      id:                    string;
      vehicle_number:        string;
      status:                string;
      created_at:            Date;
      loading_state_name:    string;
      loading_state_code:    string;
      unloading_state_name:  string;
      unloading_state_code:  string;
      driver_id:             string | null;
      driver_email:          string | null;
    }>(
      `SELECT
         t.id,
         t.vehicle_number,
         t.status,
         t.created_at,
         ls.name  AS loading_state_name,
         ls.code  AS loading_state_code,
         us.name  AS unloading_state_name,
         us.code  AS unloading_state_code,
         d.id     AS driver_id,
         d.email  AS driver_email
       FROM trips t
       JOIN states ls ON t.loading_state_id = ls.id
       JOIN states us ON t.unloading_state_id = us.id
       LEFT JOIN users d ON t.driver_id = d.id
       WHERE LOWER(t.vehicle_number) = LOWER($1)
         AND t.deleted_at IS NULL
         AND t.status IN ('created', 'in_transit', 'completed')
       ORDER BY t.created_at DESC
       LIMIT 1`,
      [vehicleNumber]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: "NOT_FOUND", message: "No active trip found for this vehicle" });
      return;
    }

    const trip = rows[0]!;

    const { rows: feeRows } = await pool.query<{ fee_type: string }>(
      `SELECT DISTINCT fee_type
       FROM trip_fees
       WHERE trip_id = $1 AND fee_type IN ('loading', 'unloading')`,
      [trip.id]
    );
    const feeTypes = new Set(feeRows.map((r) => r.fee_type));

    res.json({
      data: {
        vehicleNumber: trip.vehicle_number,
        status:        trip.status,
        loadingState: {
          name: trip.loading_state_name,
          code: trip.loading_state_code,
        },
        unloadingState: {
          name: trip.unloading_state_name,
          code: trip.unloading_state_code,
        },
        driver: trip.driver_id
          ? { id: trip.driver_id, email: trip.driver_email }
          : null,
        fees: {
          loadingFeePaid:   feeTypes.has("loading"),
          unloadingFeePaid: feeTypes.has("unloading"),
        },
        createdAt: trip.created_at,
      },
      message: "Vehicle trip status retrieved",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to look up vehicle" });
  }
}
