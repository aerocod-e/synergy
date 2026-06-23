import { type Request, type Response } from "express";
import bcrypt from "bcrypt";
import pool from "../db/connection.js";
import {
  generateTokens,
  verifyRefreshToken,
} from "../utils/tokenUtils.js";

// NOTE: Prototype scope — refresh tokens are stateless (no DB blacklist table).
// In production, store refresh tokens in a `refresh_tokens` table and
// invalidate on logout / rotation.

export async function login(req: Request, res: Response): Promise<void> {
  try {
    const { email, password } = req.body as {
      email?: string;
      password?: string;
    };

    if (!email || !password) {
      res
        .status(400)
        .json({ error: "BAD_REQUEST", message: "email and password are required" });
      return;
    }

    const { rows } = await pool.query<{
      id: string;
      email: string;
      password_hash: string;
      role: string;
      entity_type: string | null;
      entity_id: string | null;
      is_active: boolean;
      deleted_at: Date | null;
    }>(
      `SELECT id, email, password_hash, role, entity_type, entity_id, is_active, deleted_at
       FROM users WHERE email = $1 LIMIT 1`,
      [email]
    );

    const user = rows[0];

    if (!user || user.deleted_at !== null) {
      res
        .status(401)
        .json({ error: "UNAUTHORIZED", message: "Invalid credentials" });
      return;
    }

    if (!user.is_active) {
      res
        .status(403)
        .json({ error: "FORBIDDEN", message: "This account has been deactivated" });
      return;
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      res
        .status(401)
        .json({ error: "UNAUTHORIZED", message: "Invalid credentials" });
      return;
    }

    const { accessToken, refreshToken } = generateTokens(
      user.id,
      user.role,
      user.entity_type,
      user.entity_id
    );

    res.status(200).json({
      data: {
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          entityType: user.entity_type,
          entityId: user.entity_id,
        },
      },
      message: "Login successful",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Login failed" });
  }
}

export async function refresh(req: Request, res: Response): Promise<void> {
  try {
    const { refreshToken } = req.body as { refreshToken?: string };

    if (!refreshToken) {
      res
        .status(400)
        .json({ error: "BAD_REQUEST", message: "refreshToken is required" });
      return;
    }

    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      res
        .status(401)
        .json({ error: "UNAUTHORIZED", message: "Invalid or expired refresh token" });
      return;
    }

    const { rows } = await pool.query<{
      id: string;
      role: string;
      entity_type: string | null;
      entity_id: string | null;
      is_active: boolean;
      deleted_at: Date | null;
    }>(
      `SELECT id, role, entity_type, entity_id, is_active, deleted_at
       FROM users WHERE id = $1 LIMIT 1`,
      [payload.userId]
    );

    const user = rows[0];

    if (!user || user.deleted_at !== null || !user.is_active) {
      res
        .status(401)
        .json({ error: "UNAUTHORIZED", message: "User not found or inactive" });
      return;
    }

    const { accessToken } = generateTokens(
      user.id,
      user.role,
      user.entity_type,
      user.entity_id
    );

    res.status(200).json({
      data: { accessToken },
      message: "Token refreshed",
    });
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ error: "INTERNAL_ERROR", message: "Token refresh failed" });
  }
}

export function logout(_req: Request, res: Response): void {
  // NOTE: Prototype scope — no refresh token blacklist.
  // Client is responsible for discarding both tokens.
  res.status(200).json({ data: { success: true }, message: "Logged out" });
}

export function me(req: Request, res: Response): void {
  res.status(200).json({ data: req.user, message: "Authenticated user" });
}
