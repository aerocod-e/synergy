import { type Request, type Response } from "express";
import pool from "../db/connection.js";
import { getFeePaymentStatus } from "../services/paymentStatusService.js";

export async function searchTrips(req: Request, res: Response): Promise<void> {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";

  if (!q) {
    res.json({ data: { trips: [] }, message: "No search query provided" });
    return;
  }

  try {
    const searchParam = `%${q}%`;

    // Detect if the query looks like a date (YYYY-MM-DD) so we can also match by date
    const isDateQuery = /^\d{4}-\d{2}-\d{2}$/.test(q) && !isNaN(Date.parse(q));

    const { rows } = await pool.query<{
      id:                      string;
      trip_code:               string | null;
      vehicle_number:          string;
      status:                  string;
      origin_description:      string | null;
      destination_description: string | null;
      created_at:              Date;
      loading_state_name:      string;
      unloading_state_name:    string;
      driver_full_name:        string | null;
    }>(
      `SELECT
         t.id,
         t.trip_code,
         t.vehicle_number,
         t.status,
         t.origin_description,
         t.destination_description,
         t.created_at,
         ls.name AS loading_state_name,
         us.name AS unloading_state_name,
         dr.full_name AS driver_full_name
       FROM trips t
       JOIN  states ls ON t.loading_state_id   = ls.id
       JOIN  states us ON t.unloading_state_id = us.id
       LEFT JOIN drivers dr ON dr.id = t.driver_id
       WHERE (t.deleted_at IS NULL OR t.status = 'cancelled')
         AND t.status IN ('created', 'in_transit', 'completed', 'cancelled')
         AND (
               t.trip_code             ILIKE $1
           OR  t.vehicle_number        ILIKE $1
           OR  t.origin_description    ILIKE $1
           OR  t.destination_description ILIKE $1
           OR  ls.name                 ILIKE $1
           OR  us.name                 ILIKE $1
           OR  dr.full_name            ILIKE $1
           OR  dr.license_number       ILIKE $1
           OR  dr.phone_number         ILIKE $1
           ${isDateQuery ? "OR  DATE(t.created_at AT TIME ZONE 'Africa/Lagos') = $2::date" : ""}
         )
       ORDER BY t.created_at DESC
       LIMIT 20`,
      isDateQuery ? [searchParam, q] : [searchParam]
    );

    if (rows.length === 0) {
      res.json({ data: { trips: [] }, message: "No trips found" });
      return;
    }

    // For each result, fetch its fee rows and build a payment status object
    const trips = await Promise.all(
      rows.map(async (trip) => {
        const { rows: feeRows } = await pool.query<{
          id:             string;
          fee_type:       string;
          recipient_id:   string;
          recipient_type: string;
          created_at:     Date;
        }>(
          `SELECT id, fee_type, recipient_id, recipient_type, created_at
           FROM trip_fees
           WHERE trip_id = $1`,
          [trip.id]
        );

        const loadingFee   = feeRows.find((f) => f.fee_type === "loading")   ?? null;
        const unloadingFee = feeRows.find((f) => f.fee_type === "unloading") ?? null;
        const stakeholderFees = feeRows.filter((f) => f.fee_type === "stakeholder_fee");

        // Resolve stakeholder names in one query
        let stakeholderStatuses: Array<{
          stakeholderId:   string;
          stakeholderName: string;
          status:          "paid" | "pending" | "reversed";
        }> = [];

        if (stakeholderFees.length > 0) {
          const ids = stakeholderFees.map((f) => f.recipient_id);
          const { rows: stRows } = await pool.query<{ id: string; name: string }>(
            `SELECT id, name FROM stakeholders WHERE id = ANY($1::uuid[])`,
            [ids]
          );
          const nameMap = new Map(stRows.map((s) => [s.id, s.name]));
          stakeholderStatuses = stakeholderFees.map((f) => ({
            stakeholderId:   f.recipient_id,
            stakeholderName: nameMap.get(f.recipient_id) ?? "Unknown",
            status: getFeePaymentStatus(
              { id: f.id, cleared: false },
              trip.created_at,
              trip.status,
            ).status,
          }));
        }

        return {
          id:                      trip.id,
          tripCode:                trip.trip_code,
          vehicleNumber:           trip.vehicle_number,
          status:                  trip.status,
          loadingStateName:        trip.loading_state_name,
          unloadingStateName:      trip.unloading_state_name,
          driverName:              trip.driver_full_name,
          originDescription:       trip.origin_description,
          destinationDescription:  trip.destination_description,
          createdAt:               trip.created_at,
          paymentStatus: {
            loading:      getFeePaymentStatus(loadingFee   ? { id: loadingFee.id,   cleared: false } : null, trip.created_at, trip.status).status,
            unloading:    getFeePaymentStatus(unloadingFee ? { id: unloadingFee.id, cleared: false } : null, trip.created_at, trip.status).status,
            stakeholders: stakeholderStatuses,
          },
        };
      })
    );

    res.json({ data: { trips }, message: "Trips found" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to search trips" });
  }
}
