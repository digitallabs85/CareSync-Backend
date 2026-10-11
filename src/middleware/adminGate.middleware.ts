import crypto from "crypto";
import net from "net";
import { Request, Response, NextFunction } from "express";
import { env } from "../config/env";

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

/**
 * The admin API is only reachable through the admin portal's server (the Next.js
 * proxy), which adds a shared secret header. Anything else gets a plain 404, so
 * the admin endpoints can't be discovered, probed or brute-forced directly.
 */
export function adminGate(req: Request, res: Response, next: NextFunction) {
  const provided = req.header("x-admin-proxy-secret");
  if (!provided || !safeEqual(provided, env.adminProxySecret)) {
    return res.status(404).json({ error: "Not found" });
  }
  res.locals.viaAdminProxy = true;
  next();
}

/**
 * Real client IP. Behind the Next.js proxy every request arrives from Vercel's
 * network, so the proxy forwards the visitor's IP in `x-admin-client-ip`.
 * That header is only trusted once the shared secret has been verified.
 */
export function getClientIp(req: Request): string {
  if (res_viaProxy(req)) {
    const forwarded = req.header("x-admin-client-ip")?.trim();
    if (forwarded && net.isIP(forwarded)) return forwarded;
  }
  return req.ip || req.socket.remoteAddress || "unknown";
}

function res_viaProxy(req: Request): boolean {
  return (req.res?.locals as any)?.viaAdminProxy === true;
}
