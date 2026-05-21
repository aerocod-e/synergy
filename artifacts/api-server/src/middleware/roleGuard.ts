import { type Request, type Response, type NextFunction } from "express";

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res
        .status(403)
        .json({ error: "FORBIDDEN", message: "Insufficient permissions" });
      return;
    }
    next();
  };
}
