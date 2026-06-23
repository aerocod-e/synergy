import { type Request, type Response } from "express";
import pool from "../db/connection.js";
import { getFeePaymentStatus } from "../services/paymentStatusService.js";

// NOTE: GET /lookup/vehicle/:vehicleNumber is the original vehicle lookup endpoint.
// Its external contract (URL, request params, response shape, HTTP status codes)
// is frozen for backward compatibility. The internal payment status check has been
// refactored to use paymentStatusService — callers see no difference in output.
// For richer search, use GET /lookup/trips/search?q= instead.
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
         v.registration_number AS vehicle_number,
         t.status,
         t.created_at,
         ls.name  AS loading_state_name,
         ls.code  AS loading_state_code,
         us.name  AS unloading_state_name,
         us.code  AS unloading_state_code,
         d.id     AS driver_id,
         d.email  AS driver_email
       FROM trips t
       JOIN vehicles v ON t.vehicle_id = v.id
       JOIN states ls ON t.loading_state_id = ls.id
       JOIN states us ON t.unloading_state_id = us.id
       LEFT JOIN users d ON t.driver_id = d.id
       WHERE LOWER(v.registration_number) = LOWER($1)
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

    const { rows: feeRows } = await pool.query<{ id: string; fee_type: string; cleared: boolean }>(
      `SELECT id, fee_type, false AS cleared
       FROM trip_fees
       WHERE trip_id = $1 AND fee_type IN ('loading', 'unloading')`,
      [trip.id]
    );

    const loadingFee  = feeRows.find((r) => r.fee_type === "loading")  ?? null;
    const unloadingFee = feeRows.find((r) => r.fee_type === "unloading") ?? null;

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
          loadingFeePaid:   getFeePaymentStatus(loadingFee,   trip.created_at, trip.status).status === "paid",
          unloadingFeePaid: getFeePaymentStatus(unloadingFee, trip.created_at, trip.status).status === "paid",
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
