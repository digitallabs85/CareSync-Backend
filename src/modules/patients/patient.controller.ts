import { Request, Response, NextFunction } from "express";
import { savePatientSchema } from "./patient.validation";
import * as patientService from "./patient.service";

export async function save(req: Request, res: Response, next: NextFunction) {
  try {
    const input = savePatientSchema.parse(req.body);
    const clinic = (req as any).user;
    const patient = await patientService.saveOrUpdatePatient(input, clinic.id);
    res.status(201).json(patient);
  } catch (err) {
    next(err);
  }
}

export async function findByPhone(req: Request, res: Response, next: NextFunction) {
  try {
    const phone = req.query.phone as string;
    const clinic = (req as any).user;
    const patient = await patientService.findPatientByPhone(phone, clinic.id);
    if (!patient) return res.status(404).json({ error: "Not found" });
    res.json(patient);
  } catch (err) {
    next(err);
  }
}

export async function verify(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.params.token as string;
    const clinic = (req as any).user;
    const patient = await patientService.verifyToken(token, clinic.id);
    res.json(patient);
  } catch (err) {
    next(err);
  }
}

export async function todayToken(req: Request, res: Response, next: NextFunction) {
  try {
    const phone = req.params.phone as string;
    const clinic = (req as any).user;
    const patient = await patientService.getTodayTokenByPhone(phone, clinic.id);
    res.json(patient);
  } catch (err) {
    next(err);
  }
}