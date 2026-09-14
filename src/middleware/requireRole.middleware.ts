import { Request, Response, NextFunction } from "express";

export function requireRole(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    if (!allowedRoles.includes(user.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  };
}