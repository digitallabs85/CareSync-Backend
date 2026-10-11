import { Request, Response, NextFunction } from "express";
import { and, eq, lt, sql } from "drizzle-orm";
import { db } from "../db";
import { rateLimits } from "../db/schema";
import { getClientIp } from "./adminGate.middleware";

// Fixed-window counters stored in Postgres. In-memory limiters don't work on
// Vercel (each invocation can be a fresh instance), so state lives in Neon.

function windowStartFor(windowSec: number): Date {
  const ms = windowSec * 1000;
  return new Date(Math.floor(Date.now() / ms) * ms);
}

/** Increment a counter and return its new value for the current window. */
export async function hit(key: string, windowSec: number): Promise<number> {
  const windowStart = windowStartFor(windowSec);
  const [row] = await db
    .insert(rateLimits)
    .values({ key, windowStart, count: 1 })
    .onConflictDoUpdate({
      target: [rateLimits.key, rateLimits.windowStart],
      set: { count: sql`${rateLimits.count} + 1` },
    })
    .returning({ count: rateLimits.count });

  // Opportunistic cleanup (~1% of calls) so the table never grows unbounded.
  if (Math.random() < 0.01) {
    void db
      .delete(rateLimits)
      .where(lt(rateLimits.windowStart, new Date(Date.now() - 24 * 60 * 60 * 1000)))
      .catch(() => {});
  }
  return row.count;
}

/** Read a counter without incrementing it. */
export async function peek(key: string, windowSec: number): Promise<number> {
  const windowStart = windowStartFor(windowSec);
  const [row] = await db
    .select({ count: rateLimits.count })
    .from(rateLimits)
    .where(and(eq(rateLimits.key, key), eq(rateLimits.windowStart, windowStart)))
    .limit(1);
  return row?.count ?? 0;
}

export function retryAfterSeconds(windowSec: number): number {
  const end = windowStartFor(windowSec).getTime() + windowSec * 1000;
  return Math.max(1, Math.ceil((end - Date.now()) / 1000));
}

interface Options {
  name: string;
  max: number;
  windowSec: number;
  /** Defaults to the client IP. */
  key?: (req: Request) => string;
}

export function rateLimit(opts: Options) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = opts.key ? opts.key(req) : getClientIp(req);
      const count = await hit(`${opts.name}:${id}`, opts.windowSec);
      if (count > opts.max) {
        res.setHeader("Retry-After", String(retryAfterSeconds(opts.windowSec)));
        return res.status(429).json({ error: "Too many requests. Please slow down.", code: "RATE_LIMITED" });
      }
      next();
    } catch (err) {
      // Fail closed: if we can't count, don't let the request through unmetered.
      console.error("[rateLimit] error", err);
      res.status(503).json({ error: "Service temporarily unavailable" });
    }
  };
}
