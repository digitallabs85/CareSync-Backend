import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No token provided" });
  }

  const token = header.split(" ")[1];
  try {
    const payload = jwt.verify(token, env.jwtSecret);
    (req as any).user = payload;
    next();
  } catch (err) {
    console.log("JWT verify error:", (err as Error).message); // TEMP DEBUG
    res.status(401).json({ error: "Invalid or expired token" });
  }
}