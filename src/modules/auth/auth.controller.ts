import { Request, Response, NextFunction } from "express";
import { signupSchema, loginSchema } from "./auth.validation";
import * as authService from "./auth.service";

export async function signup(req: Request, res: Response, next: NextFunction) {
  try {
    const input = signupSchema.parse(req.body);
    const clinic = await authService.signupClinic(input);
    res.status(201).json(clinic);
  } catch (err) {
    next(err);
  }
}

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const input = loginSchema.parse(req.body);
    const result = await authService.loginClinic(input);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function me(req: Request, res: Response, next: NextFunction) {
  try {
    const clinicId = (req as any).user.id; // set by auth middleware
    const result = await authService.getClinicProfile(clinicId);
    res.json(result);
  } catch (err) {
    next(err);
  }
}