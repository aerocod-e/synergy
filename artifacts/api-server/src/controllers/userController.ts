import { type Request, type Response } from "express";
import bcrypt from "bcrypt";
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
       ORDER BY u.role ASC, u.email ASC`,
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

export async function listTripAdmins(req: Request, res: Response): Promise<void> {
  try {
    const callerEntityId = req.user!.entityId;

    const { rows } = await pool.query<{
      id: string;
      email: string;
      is_active: boolean;
      can_cancel_without_approval: boolean;
      created_at: Date;
    }>(
      `SELECT id, email, is_active, can_cancel_without_approval, created_at
       FROM users
       WHERE role = 'trip_admin'
         AND entity_id = $1
         AND deleted_at IS NULL
       ORDER BY created_at DESC`,
      [callerEntityId],
    );

    res.json({
      data: {
        tripAdmins: rows.map((r) => ({
          id: r.id,
          email: r.email,
          isActive: r.is_active,
          canCancelWithoutApproval: r.can_cancel_without_approval,
          createdAt: r.created_at,
        })),
      },
      message: "Trip admins retrieved",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to retrieve trip admins" });
  }
}

const VALID_ROLES = ["super_admin", "state_admin", "trip_admin", "stakeholder"] as const;
type ValidRole = (typeof VALID_ROLES)[number];

export async function createUser(req: Request, res: Response): Promise<void> {
  try {
    const { email, password, role, entity_type, entity_id } = req.body as {
      email?: unknown;
      password?: unknown;
      role?: unknown;
      entity_type?: unknown;
      entity_id?: unknown;
    };

    // ── Basic field validation ─────────────────────────────────────────────
    if (!email || typeof email !== "string" || !email.includes("@")) {
      res.status(400).json({ error: "BAD_REQUEST", message: "Valid email is required" });
      return;
    }
    if (!password || typeof password !== "string" || password.length < 6) {
      res.status(400).json({ error: "BAD_REQUEST", message: "Password must be at least 6 characters" });
      return;
    }
    if (!role || !VALID_ROLES.includes(role as ValidRole)) {
      res.status(400).json({ error: "BAD_REQUEST", message: "role must be one of: super_admin, state_admin, trip_admin, stakeholder" });
      return;
    }

    const typedRole = role as ValidRole;
    const caller = req.user!;

    // ── Caller-role restrictions ───────────────────────────────────────────
    if (caller.role === "super_admin") {
      if (typedRole !== "state_admin" && typedRole !== "stakeholder") {
        res.status(403).json({ error: "FORBIDDEN", message: "Super Admin can only create state_admin or stakeholder users" });
        return;
      }
    } else if (caller.role === "state_admin") {
      if (typedRole !== "trip_admin") {
        res.status(403).json({ error: "FORBIDDEN", message: "State Admin can only create trip_admin users" });
        return;
      }
    } else {
      res.status(403).json({ error: "FORBIDDEN", message: "Insufficient permissions to create users" });
      return;
    }

    // ── Entity linking rules ───────────────────────────────────────────────
    if (typedRole === "state_admin" || typedRole === "trip_admin") {
      if (entity_type !== "state" || !entity_id || typeof entity_id !== "string") {
        res.status(400).json({ error: "BAD_REQUEST", message: `${typedRole} requires entity_type 'state' and a valid entity_id` });
        return;
      }
      if (caller.role === "state_admin" && entity_id !== caller.entityId) {
        res.status(403).json({ error: "FORBIDDEN", message: "State Admin can only create users linked to their own state" });
        return;
      }
      const stateCheck = await pool.query<{ id: string }>("SELECT id FROM states WHERE id = $1", [entity_id]);
      if (stateCheck.rows.length === 0) {
        res.status(400).json({ error: "BAD_REQUEST", message: "entity_id does not match any known state" });
        return;
      }
    } else if (typedRole === "stakeholder") {
      if (entity_type !== "stakeholder" || !entity_id || typeof entity_id !== "string") {
        res.status(400).json({ error: "BAD_REQUEST", message: "stakeholder requires entity_type 'stakeholder' and a valid entity_id" });
        return;
      }
      const shCheck = await pool.query<{ id: string }>("SELECT id FROM stakeholders WHERE id = $1", [entity_id]);
      if (shCheck.rows.length === 0) {
        res.status(400).json({ error: "BAD_REQUEST", message: "entity_id does not match any known stakeholder" });
        return;
      }
    } else if (typedRole === "super_admin") {
      if (entity_type || entity_id) {
        res.status(400).json({ error: "BAD_REQUEST", message: "super_admin must not have entity fields" });
        return;
      }
    }

    // ── Hash + insert ──────────────────────────────────────────────────────
    const passwordHash = await bcrypt.hash(password, 10);

    const { rows } = await pool.query<{
      id: string;
      email: string;
      role: string;
      entity_type: string | null;
      entity_id: string | null;
      is_active: boolean;
      created_at: Date;
    }>(
      `INSERT INTO users (email, password_hash, role, entity_type, entity_id, is_active)
       VALUES ($1, $2, $3, $4, $5, true)
       RETURNING id, email, role, entity_type, entity_id, is_active, created_at`,
      [
        email.toLowerCase().trim(),
        passwordHash,
        typedRole,
        (entity_type as string | undefined) ?? null,
        (entity_id as string | undefined) ?? null,
      ],
    );

    const user = rows[0]!;
    res.status(201).json({
      data: {
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          entityType: user.entity_type,
          entityId: user.entity_id,
          isActive: user.is_active,
          createdAt: user.created_at,
        },
      },
      message: "User created",
    });
  } catch (err: any) {
    if (err?.code === "23505") {
      res.status(409).json({ error: "CONFLICT", message: "A user with this email already exists" });
      return;
    }
    console.error(err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to create user" });
  }
}
