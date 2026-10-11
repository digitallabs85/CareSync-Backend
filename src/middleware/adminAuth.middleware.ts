import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { admins } from "../db/schema";
import { env } from "../config/env";
import { can, isAdminRole, type AdminRole, type Permission } from "../modules/admin/admin.permissions";
import { getClientIp } from "./adminGate.middleware";

export interface AdminActor {
  id: string;
  username: string;
  name: string | null;
  role: AdminRole;
  ip: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      admin?: AdminActor;
    }
  }
}

/**
 * Authenticates an admin on EVERY request against the database — the JWT only
 * proves identity. Role, status and token version always come from the DB, so
 * suspending an admin, changing their role, resetting their password or
 * logging out takes effect immediately instead of when the token expires.
 */
export async function adminAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  let payload: jwt.JwtPayload;
  try {
    const decoded = jwt.verify(header.slice(7), env.jwtSecret, { algorithms: ["HS256"] });
    if (typeof decoded === "string") throw new Error("bad payload");
    payload = decoded;
  } catch {
    return res.status(401).json({ error: "Invalid or expired session" });
  }

  if (payload.typ !== "admin" || typeof payload.id !== "string") {
    return res.status(401).json({ error: "Invalid or expired session" });
  }

  const admin = await db.query.admins.findFirst({
    where: eq(admins.id, payload.id),
    columns: { id: true, username: true, name: true, role: true, status: true, tokenVersion: true },
  });

  if (!admin || admin.status !== "Active" || admin.tokenVersion !== payload.tv || !isAdminRole(admin.role)) {
    return res.status(401).json({ error: "Invalid or expired session" });
  }

  req.admin = {
    id: admin.id,
    username: admin.username,
    name: admin.name,
    role: admin.role,
    ip: getClientIp(req),
  };
  next();
}

export function requirePermission(permission: Permission) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.admin) return res.status(401).json({ error: "Not authenticated" });
    if (!can(req.admin.role, permission)) {
      return res.status(403).json({ error: "You don't have permission to do that", code: "FORBIDDEN" });
    }
    next();
  };
}
