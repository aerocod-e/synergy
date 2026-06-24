import { type Request, type Response } from "express";
import bcrypt from "bcrypt";
import pool from "../db/connection.js";

export async function listUsers(req: Request, res: Response): Promise<void> {
  const rawPage  = parseInt((req.query.page  as string) ?? "1",  10);
  const rawLimit = parseInt((req.query.limit as string) ?? "20", 10);
  const page     = Number.isFinite(rawPage)  && rawPage  > 0 ? rawPage                   : 1;
  const limit    = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100)   : 20;
  const offset   = (page - 1) * limit;

  try {
    const [countRes, rowsRes] = await Promise.all([
      pool.query<{ total: string }>(
        `SELECT COUNT(*) AS total FROM users WHERE deleted_at IS NULL`
      ),
      pool.query<{
        id: string;
        email: string;
        first_name: string;
        last_name: string;
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
           u.first_name,
           u.last_name,
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
         LEFT JOIN states       s  ON u.entity_type = 'state'       AND u.entity_id = s.id
         LEFT JOIN stakeholders sh ON u.entity_type = 'stakeholder' AND u.entity_id = sh.id
         WHERE u.deleted_at IS NULL
         ORDER BY u.role ASC, u.email ASC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      ),
    ]);

    const total      = parseInt(countRes.rows[0]!.total, 10);
    const totalPages = Math.ceil(total / limit) || 1;

    res.json({
      data: {
        users: rowsRes.rows.map((r) => ({
          id:         r.id,
          email:      r.email,
          firstName:  r.first_name,
          lastName:   r.last_name,
          role:       r.role,
          entityType: r.entity_type,
          entityId:   r.entity_id,
          entityName: r.entity_name,
          isActive:   r.is_active,
          createdAt:  r.created_at,
        })),
        pagination: { page, limit, total, totalPages },
      },
      message: "Users retrieved",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to retrieve users" });
  }
}

export async function getUserById(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { rows } = await pool.query<{
      id: string;
      email: string;
      first_name: string;
      last_name: string;
      role: string;
      entity_type: string | null;
      entity_id: string | null;
      is_active: boolean;
      created_at: Date;
      entity_name: string | null;
    }>(
      `SELECT
         u.id, u.email, u.first_name, u.last_name, u.role,
         u.entity_type, u.entity_id, u.is_active, u.created_at,
         CASE
           WHEN u.entity_type = 'state'       THEN s.name
           WHEN u.entity_type = 'stakeholder' THEN sh.name
           ELSE NULL
         END AS entity_name
       FROM users u
       LEFT JOIN states       s  ON u.entity_type = 'state'       AND u.entity_id = s.id
       LEFT JOIN stakeholders sh ON u.entity_type = 'stakeholder' AND u.entity_id = sh.id
       WHERE u.id = $1 AND u.deleted_at IS NULL`,
      [id]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: "NOT_FOUND", message: "User not found" });
      return;
    }

    const r = rows[0]!;
    res.json({
      data: {
        user: {
          id:         r.id,
          email:      r.email,
          firstName:  r.first_name,
          lastName:   r.last_name,
          role:       r.role,
          entityType: r.entity_type,
          entityId:   r.entity_id,
          entityName: r.entity_name,
          isActive:   r.is_active,
          createdAt:  r.created_at,
        },
      },
      message: "User retrieved",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to retrieve user" });
  }
}

export async function listTripAdmins(req: Request, res: Response): Promise<void> {
  const callerEntityId = req.user!.entityId;

  const rawPage  = parseInt((req.query.page  as string) ?? "1",  10);
  const rawLimit = parseInt((req.query.limit as string) ?? "20", 10);
  const page     = Number.isFinite(rawPage)  && rawPage  > 0 ? rawPage                   : 1;
  const limit    = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100)   : 20;
  const offset   = (page - 1) * limit;

  try {
    const [countRes, rowsRes] = await Promise.all([
      pool.query<{ total: string }>(
        `SELECT COUNT(*) AS total
         FROM users
         WHERE role = 'trip_admin'
           AND entity_id = $1
           AND deleted_at IS NULL`,
        [callerEntityId]
      ),
      pool.query<{
        id: string;
        email: string;
        first_name: string;
        last_name: string;
        is_active: boolean;
        can_cancel_without_approval: boolean;
        created_at: Date;
        trip_count: string;
      }>(
        `SELECT u.id, u.email, u.first_name, u.last_name, u.is_active, u.can_cancel_without_approval, u.created_at,
                COUNT(t.id) AS trip_count
         FROM users u
         LEFT JOIN trips t ON t.created_by = u.id AND t.deleted_at IS NULL
         WHERE u.role = 'trip_admin'
           AND u.entity_id = $1
           AND u.deleted_at IS NULL
         GROUP BY u.id, u.email, u.first_name, u.last_name, u.is_active, u.can_cancel_without_approval, u.created_at
         ORDER BY u.created_at DESC
         LIMIT $2 OFFSET $3`,
        [callerEntityId, limit, offset],
      ),
    ]);

    const total      = parseInt(countRes.rows[0]!.total, 10);
    const totalPages = Math.ceil(total / limit) || 1;

    res.json({
      data: {
        tripAdmins: rowsRes.rows.map((r) => ({
          id:                       r.id,
          email:                    r.email,
          firstName:                r.first_name,
          lastName:                 r.last_name,
          isActive:                 r.is_active,
          canCancelWithoutApproval: r.can_cancel_without_approval,
          createdAt:                r.created_at,
          tripCount:                Number(r.trip_count),
        })),
        pagination: { page, limit, total, totalPages },
      },
      message: "Trip admins retrieved",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to retrieve trip admins" });
  }
}

export async function toggleUserActive(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const caller = req.user!;
    const { isActive } = req.body as { isActive?: unknown };

    if (typeof isActive !== "boolean") {
      res.status(400).json({ error: "BAD_REQUEST", message: "isActive must be a boolean" });
      return;
    }

    const { rows } = await pool.query<{
      id: string;
      email: string;
      role: string;
      entity_id: string | null;
      is_active: boolean;
      can_cancel_without_approval: boolean;
      created_at: Date;
    }>(
      `SELECT id, email, role, entity_id, is_active, can_cancel_without_approval, created_at
       FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );

    if (rows.length === 0) {
      res.status(404).json({ error: "NOT_FOUND", message: "User not found" });
      return;
    }

    const target = rows[0]!;

    if (caller.role === "state_admin") {
      if (target.role !== "trip_admin") {
        res.status(403).json({ error: "FORBIDDEN", message: "Can only toggle active status for trip_admin accounts" });
        return;
      }
      if (target.entity_id !== caller.entityId) {
        res.status(403).json({ error: "FORBIDDEN", message: "Cannot modify a trip admin from a different state" });
        return;
      }
    } else if (caller.role === "super_admin") {
      if (id === caller.userId) {
        res.status(400).json({ error: "BAD_REQUEST", message: "You cannot modify your own account status" });
        return;
      }
      if (target.role === "super_admin") {
        res.status(403).json({ error: "FORBIDDEN", message: "Cannot modify Super Admin accounts" });
        return;
      }
    }

    const { rows: updated } = await pool.query<{
      id: string;
      email: string;
      is_active: boolean;
      can_cancel_without_approval: boolean;
      created_at: Date;
    }>(
      `UPDATE users SET is_active = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, email, is_active, can_cancel_without_approval, created_at`,
      [isActive, id],
    );

    const u = updated[0]!;
    res.json({
      data: {
        user: {
          id: u.id,
          email: u.email,
          isActive: u.is_active,
          canCancelWithoutApproval: u.can_cancel_without_approval,
          createdAt: u.created_at,
        },
      },
      message: isActive ? "User reactivated" : "User deactivated",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to update user status" });
  }
}

export async function getTripAdminActiveTripsCount(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const caller = req.user!;

    const { rows } = await pool.query<{
      id: string;
      role: string;
      entity_id: string | null;
    }>(
      `SELECT id, role, entity_id FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );

    if (rows.length === 0) {
      res.status(404).json({ error: "NOT_FOUND", message: "User not found" });
      return;
    }

    const target = rows[0]!;

    if (target.role !== "trip_admin") {
      res.status(400).json({ error: "BAD_REQUEST", message: "User is not a trip admin" });
      return;
    }

    if (target.entity_id !== caller.entityId) {
      res.status(403).json({ error: "FORBIDDEN", message: "Cannot query a trip admin from a different state" });
      return;
    }

    const { rows: countRows } = await pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM trips WHERE created_by = $1 AND status = 'in_progress' AND deleted_at IS NULL`,
      [id],
    );

    const activeTripsCount = Number(countRows[0]?.count ?? 0);

    res.json({
      data: { activeTripsCount },
      message: "Active trips count retrieved",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to retrieve active trips count" });
  }
}

const VALID_ROLES = ["super_admin", "state_admin", "trip_admin", "stakeholder"] as const;
type ValidRole = (typeof VALID_ROLES)[number];

// ── Helper: map a DB user row to the API response shape ─────────────────────
function mapUser(r: {
  id: string; email: string; first_name: string; last_name: string;
  role: string; entity_type: string | null; entity_id: string | null;
  is_active: boolean; created_at: Date;
}) {
  return {
    id:         r.id,
    email:      r.email,
    firstName:  r.first_name,
    lastName:   r.last_name,
    role:       r.role,
    entityType: r.entity_type,
    entityId:   r.entity_id,
    isActive:   r.is_active,
    createdAt:  r.created_at,
  };
}

export async function createUser(req: Request, res: Response): Promise<void> {
  try {
    const { email, password, role, entity_type, entity_id, firstName, lastName, stakeholderName } = req.body as {
      email?: unknown;
      password?: unknown;
      role?: unknown;
      entity_type?: unknown;
      entity_id?: unknown;
      firstName?: unknown;
      lastName?: unknown;
      stakeholderName?: unknown;
    };

    // ── Basic field validation ─────────────────────────────────────────────
    if (!firstName || typeof firstName !== "string" || !firstName.trim()) {
      res.status(400).json({ error: "BAD_REQUEST", message: "firstName is required" });
      return;
    }
    if (!lastName || typeof lastName !== "string" || !lastName.trim()) {
      res.status(400).json({ error: "BAD_REQUEST", message: "lastName is required" });
      return;
    }
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
    const emailNorm = (email as string).toLowerCase().trim();
    const firstNameTrimmed = (firstName as string).trim();
    const lastNameTrimmed  = (lastName  as string).trim();

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
      if (!stakeholderName || typeof stakeholderName !== "string" || !stakeholderName.trim()) {
        res.status(400).json({ error: "BAD_REQUEST", message: "stakeholderName is required for stakeholder users" });
        return;
      }
    } else if (typedRole === "super_admin") {
      if (entity_type || entity_id) {
        res.status(400).json({ error: "BAD_REQUEST", message: "super_admin must not have entity fields" });
        return;
      }
    }

    // ── Hash password before entering any transaction ──────────────────────
    const passwordHash = await bcrypt.hash(password as string, 10);

    // ── Stakeholder path: fully atomic (resolve/create entity + user) ───────
    if (typedRole === "stakeholder") {
      const shName = (stakeholderName as string).trim();
      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        // Case-insensitive lookup inside the transaction to avoid races
        const existingSh = await client.query<{ id: string }>(
          `SELECT id FROM stakeholders WHERE LOWER(name) = LOWER($1)`,
          [shName],
        );
        let resolvedShId: string;
        if (existingSh.rows.length > 0) {
          resolvedShId = existingSh.rows[0]!.id;
        } else {
          const newSh = await client.query<{ id: string }>(
            `INSERT INTO stakeholders (name) VALUES ($1) RETURNING id`,
            [shName],
          );
          resolvedShId = newSh.rows[0]!.id;
          await client.query(
            `INSERT INTO wallets (owner_type, owner_id, total_collected)
             VALUES ('stakeholder', $1, 0) ON CONFLICT DO NOTHING`,
            [resolvedShId],
          );
        }

        // ── Check for existing user (active or soft-deleted) ───────────────
        const existingUser = await client.query<{ id: string; deleted_at: Date | null }>(
          `SELECT id, deleted_at FROM users WHERE email = $1`,
          [emailNorm],
        );

        if (existingUser.rows.length > 0) {
          const eu = existingUser.rows[0]!;
          if (eu.deleted_at === null) {
            // Active user → conflict
            await client.query("ROLLBACK");
            res.status(409).json({ error: "CONFLICT", message: "A user with this email already exists" });
            return;
          }
          // Soft-deleted → reactivate
          const { rows: reactivated } = await client.query<{
            id: string; email: string; first_name: string; last_name: string;
            role: string; entity_type: string | null; entity_id: string | null;
            is_active: boolean; created_at: Date;
          }>(
            `UPDATE users
             SET first_name=$1, last_name=$2, role=$3, entity_type='stakeholder', entity_id=$4,
                 password_hash=$5, is_active=true, deleted_at=NULL, updated_at=NOW()
             WHERE id=$6
             RETURNING id, email, first_name, last_name, role, entity_type, entity_id, is_active, created_at`,
            [firstNameTrimmed, lastNameTrimmed, typedRole, resolvedShId, passwordHash, eu.id],
          );
          await client.query("COMMIT");
          res.status(200).json({
            data: { user: mapUser(reactivated[0]!) },
            message: "A previously deactivated account with this email has been reactivated with the new details.",
          });
          return;
        }

        // ── Fresh INSERT ───────────────────────────────────────────────────
        const { rows } = await client.query<{
          id: string; email: string; first_name: string; last_name: string;
          role: string; entity_type: string | null; entity_id: string | null;
          is_active: boolean; created_at: Date;
        }>(
          `INSERT INTO users (email, password_hash, role, entity_type, entity_id, is_active, first_name, last_name)
           VALUES ($1, $2, $3, 'stakeholder', $4, true, $5, $6)
           RETURNING id, email, first_name, last_name, role, entity_type, entity_id, is_active, created_at`,
          [emailNorm, passwordHash, typedRole, resolvedShId, firstNameTrimmed, lastNameTrimmed],
        );

        await client.query("COMMIT");
        res.status(201).json({ data: { user: mapUser(rows[0]!) }, message: "User created" });
      } catch (err: any) {
        await client.query("ROLLBACK");
        if (err?.code === "23505") {
          res.status(409).json({ error: "CONFLICT", message: "A user with this email already exists" });
          return;
        }
        throw err;
      } finally {
        client.release();
      }
      return;
    }

    // ── Non-stakeholder path ───────────────────────────────────────────────
    const resolvedEntityType: string | null = (entity_type as string | undefined) ?? null;
    const resolvedEntityId: string | null   = (entity_id   as string | undefined) ?? null;

    // Check for existing user (active or soft-deleted)
    const existingUser = await pool.query<{ id: string; deleted_at: Date | null }>(
      `SELECT id, deleted_at FROM users WHERE email = $1`,
      [emailNorm],
    );

    if (existingUser.rows.length > 0) {
      const eu = existingUser.rows[0]!;
      if (eu.deleted_at === null) {
        res.status(409).json({ error: "CONFLICT", message: "A user with this email already exists" });
        return;
      }
      // Soft-deleted → reactivate
      const { rows: reactivated } = await pool.query<{
        id: string; email: string; first_name: string; last_name: string;
        role: string; entity_type: string | null; entity_id: string | null;
        is_active: boolean; created_at: Date;
      }>(
        `UPDATE users
         SET first_name=$1, last_name=$2, role=$3, entity_type=$4, entity_id=$5,
             password_hash=$6, is_active=true, deleted_at=NULL, updated_at=NOW()
         WHERE id=$7
         RETURNING id, email, first_name, last_name, role, entity_type, entity_id, is_active, created_at`,
        [firstNameTrimmed, lastNameTrimmed, typedRole, resolvedEntityType, resolvedEntityId, passwordHash, eu.id],
      );
      res.status(200).json({
        data: { user: mapUser(reactivated[0]!) },
        message: "A previously deactivated account with this email has been reactivated with the new details.",
      });
      return;
    }

    // Fresh INSERT
    const { rows } = await pool.query<{
      id: string; email: string; first_name: string; last_name: string;
      role: string; entity_type: string | null; entity_id: string | null;
      is_active: boolean; created_at: Date;
    }>(
      `INSERT INTO users (email, password_hash, role, entity_type, entity_id, is_active, first_name, last_name)
       VALUES ($1, $2, $3, $4, $5, true, $6, $7)
       RETURNING id, email, first_name, last_name, role, entity_type, entity_id, is_active, created_at`,
      [emailNorm, passwordHash, typedRole, resolvedEntityType, resolvedEntityId, firstNameTrimmed, lastNameTrimmed],
    );

    res.status(201).json({ data: { user: mapUser(rows[0]!) }, message: "User created" });
  } catch (err: any) {
    if (err?.code === "23505") {
      res.status(409).json({ error: "CONFLICT", message: "A user with this email already exists" });
      return;
    }
    console.error(err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to create user" });
  }
}

export async function updateUser(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { firstName, lastName } = req.body as { firstName?: unknown; lastName?: unknown };

    const hasFirst = firstName && typeof firstName === "string" && (firstName as string).trim();
    const hasLast  = lastName  && typeof lastName  === "string" && (lastName  as string).trim();

    if (!hasFirst && !hasLast) {
      res.status(400).json({ error: "BAD_REQUEST", message: "At least one of firstName or lastName is required" });
      return;
    }

    const { rows: current } = await pool.query<{ first_name: string; last_name: string }>(
      `SELECT first_name, last_name FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    if (current.length === 0) {
      res.status(404).json({ error: "NOT_FOUND", message: "User not found" });
      return;
    }

    const newFirst = hasFirst ? (firstName as string).trim() : current[0]!.first_name;
    const newLast  = hasLast  ? (lastName  as string).trim() : current[0]!.last_name;

    const { rows: updated } = await pool.query<{
      id: string; email: string; first_name: string; last_name: string;
      role: string; entity_type: string | null; entity_id: string | null;
      is_active: boolean; created_at: Date;
    }>(
      `UPDATE users SET first_name=$1, last_name=$2, updated_at=NOW()
       WHERE id=$3 AND deleted_at IS NULL
       RETURNING id, email, first_name, last_name, role, entity_type, entity_id, is_active, created_at`,
      [newFirst, newLast, id],
    );

    res.json({ data: { user: mapUser(updated[0]!) }, message: "User updated" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to update user" });
  }
}

export async function deleteUser(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const caller = req.user!;

    if (id === caller.userId) {
      res.status(400).json({ error: "BAD_REQUEST", message: "You cannot delete your own account" });
      return;
    }

    const { rows } = await pool.query<{ id: string; role: string; deleted_at: Date | null }>(
      `SELECT id, role, deleted_at FROM users WHERE id = $1`,
      [id],
    );

    if (rows.length === 0 || rows[0]!.deleted_at !== null) {
      res.status(404).json({ error: "NOT_FOUND", message: "User not found" });
      return;
    }

    if (rows[0]!.role === "super_admin") {
      res.status(400).json({
        error: "BAD_REQUEST",
        message: "Super Admin accounts cannot be deleted from this screen. Contact your system administrator.",
      });
      return;
    }

    await pool.query(
      `UPDATE users SET deleted_at = NOW(), is_active = false, updated_at = NOW() WHERE id = $1`,
      [id],
    );

    res.status(200).json({ data: {}, message: "Account has been deactivated successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to delete user" });
  }
}

export async function deleteTripAdmin(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const caller = req.user!;

    const { rows } = await pool.query<{
      id: string;
      role: string;
      entity_id: string | null;
      deleted_at: Date | null;
    }>(
      `SELECT id, role, entity_id, deleted_at FROM users WHERE id = $1`,
      [id]
    );

    const target = rows[0];
    if (!target || target.deleted_at !== null) {
      res.status(404).json({ error: "NOT_FOUND", message: "Trip Admin not found" });
      return;
    }
    if (target.role !== "trip_admin") {
      res.status(403).json({ error: "FORBIDDEN", message: "Target user is not a Trip Admin" });
      return;
    }
    if (target.entity_id !== caller.entityId) {
      res.status(403).json({ error: "FORBIDDEN", message: "This Trip Admin does not belong to your state" });
      return;
    }

    const activeTrip = await pool.query<{ id: string }>(
      `SELECT id FROM trips
       WHERE  created_by = $1
         AND  status IN ('created', 'in_transit')
         AND  deleted_at IS NULL
       LIMIT  1`,
      [id]
    );
    if (activeTrip.rows.length > 0) {
      res.status(400).json({
        error: "ACTIVE_TRIP",
        message: "Cannot delete a Trip Admin who has active trips. Resolve all active trips first.",
      });
      return;
    }

    await pool.query(
      `UPDATE users SET deleted_at = NOW(), is_active = false, updated_at = NOW() WHERE id = $1`,
      [id]
    );

    res.status(200).json({ data: {}, message: "Trip Admin account has been deactivated successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to delete Trip Admin" });
  }
}

export async function resetUserPassword(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const caller = req.user!;

    // ── Guard: cannot reset own password ──────────────────────────────────
    if (id === caller.userId) {
      res.status(400).json({
        error: "BAD_REQUEST",
        message: "You cannot reset your own password. Use the Profile screen to change your password.",
      });
      return;
    }

    // ── Guard: fetch target to check role ─────────────────────────────────
    const { rows } = await pool.query<{ role: string }>(
      `SELECT role FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    if (rows.length === 0) {
      res.status(404).json({ error: "NOT_FOUND", message: "User not found" });
      return;
    }
    if (rows[0]!.role === "super_admin") {
      res.status(400).json({
        error: "BAD_REQUEST",
        message: "Super Admin passwords cannot be reset from here. The account holder should use the Profile screen.",
      });
      return;
    }

    const hash = await bcrypt.hash("Temp@1234", 10);
    await pool.query(
      `UPDATE users SET password_hash = $1 WHERE id = $2 AND deleted_at IS NULL`,
      [hash, id],
    );
    res.status(200).json({
      data: {
        message:
          "Password has been reset to Temp@1234. Please inform the user to log in and change their password immediately.",
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to reset password" });
  }
}
