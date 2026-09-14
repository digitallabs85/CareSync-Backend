import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";

export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: "Validation failed", details: err.flatten() });
  }

  const status = err.status || 500;
  const response: any = { error: err.message || "Internal server error" };
  if (err.code) response.code = err.code;

  if (status === 500) console.error(err);
  res.status(status).json(response);
}