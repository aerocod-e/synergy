import { type Request, type Response } from "express";
import pool from "../db/connection.js";

export async function listUsers(_req: Request, res: Response): Promise<void> {
  try {
    const { rows } = await pool.query<{
      id: string;
      email: string;
      role: string;
      entity_type: string | null;
      entity_id: string | null;
      is_active: boolean;
      created_at: Date;
      entity_name: string | null;
    }>(
      `SELECT
         u.id,
         u.email,
         u.role,
         u.entity_type,
         u.entity_id,
         u.is_active,
         u.created_at,
         CASE
           WHEN u.entity_type = 'state'       THEN s.name
           WHEN u.entity_type = 'stakeholder' THEN sh.name
           ELSE NULL
         END AS entity_name
       FROM users u
       LEFT JOIN states      s  ON u.entity_type = 'state'       AND u.entity_id = s.id
       LEFT JOIN stakeholders sh ON u.entity_type = 'stakeholder' AND u.entity_id = sh.id
       WHERE u.deleted_at IS NULL
       ORDER BY u.role ASC, u.email ASC`
    );

    res.json({
      data: {
        users: rows.map((r) => ({
          id: r.id,
          email: r.email,
          role: r.role,
          entityType: r.entity_type,
          entityId: r.entity_id,
          entityName: r.entity_name,
          isActive: r.is_active,
          createdAt: r.created_at,
        })),
      },
      message: "Users retrieved",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to retrieve users" });
  }
}
