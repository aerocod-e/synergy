import { type Request, type Response, type NextFunction } from "express";
import { verifyAccessToken, type TokenPayload } from "../utils/tokenUtils.js";
import pool from "../db/connection.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

export async function authenticateToken(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers["authorization"];
  const token =
    authHeader && authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;

  if (!token) {
    res
      .status(401)
      .json({ error: "UNAUTHORIZED", message: "No token provided" });
    return;
  }

  let payload: TokenPayload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    res
      .status(401)
      .json({ error: "UNAUTHORIZED", message: "Invalid or expired token" });
    return;
  }

  try {
    const { rows } = await pool.query<{ is_active: boolean }>(
      `SELECT is_active FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [payload.userId]
    );
    if (rows.length === 0 || !rows[0]!.is_active) {
      res.status(401).json({
        error: "UNAUTHORIZED",
        message: "This account has been deactivated.",
      });
      return;
    }
  } catch {
    res.status(500).json({
      error: "INTERNAL_ERROR",
      message: "Authentication check failed",
    });
    return;
  }

  req.user = payload;
  next();
}
