import { type Request, type Response, type NextFunction } from "express";
import { verifyAccessToken, type TokenPayload } from "../utils/tokenUtils.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

export function authenticateToken(
  req: Request,
  res: Response,
  next: NextFunction
): void {
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

  try {
    req.user = verifyAccessToken(token);
    next();
  } catch {
    res
      .status(401)
      .json({ error: "UNAUTHORIZED", message: "Invalid or expired token" });
  }
}
