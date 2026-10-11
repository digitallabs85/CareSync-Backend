import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { env } from "../config/env";

export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: "Validation failed", details: err.flatten() });
  }

  // body-parser errors (malformed JSON, payload too large)
  if (err?.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Malformed JSON body" });
  }
  if (err?.type === "entity.too.large") {
    return res.status(413).json({ error: "Request body too large" });
  }

  const status = err.status || 500;
  // Never leak internal error messages (SQL, stack hints) to clients in production.
  const message = status === 500 && env.isProduction ? "Internal server error" : err.message || "Internal server error";
  const response: any = { error: message };
  if (err.code && typeof err.code === "string" && status !== 500) response.code = err.code;

  if (status === 500) console.error(err);
  res.status(status).json(response);
}
