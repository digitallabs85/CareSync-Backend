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

export async function find(req: Request, res: Response, next: NextFunction) {
  try {
    const phone = req.query.phone as string | undefined;
    const mrNumber = req.query.mrNumber as string | undefined;
    const clinic = (req as any).user;

    if (!phone && !mrNumber) {
      return res.status(400).json({ error: 'phone or mrNumber query param is required' });
    }

    const patient = phone
      ? await patientService.findPatientByPhone(phone)
      : await patientService.findPatientByMrNumber(mrNumber!, clinic.id);

    if (!patient) return res.status(404).json({ error: 'Not found' });
    res.json(patient);
  } catch (err) {
    next(err);
  }
}

export async function findByMrNumber(req: Request, res: Response, next: NextFunction) {
  try {
    const mrNumber = req.query.mrNumber as string;
    if (!mrNumber) {
      return res.status(400).json({ error: 'mrNumber query param is required' });
    }
    const clinic = (req as any).user;
    const patient = await patientService.findPatientByMrNumber(mrNumber, clinic.id);
    if (!patient) {
      return res.status(404).json({ error: 'Not found' });
    }
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

export async function getToday(req: Request, res: Response, next: NextFunction) {
  try {
    const clinic = (req as any).user;
    const patients = await patientService.getTodayPatients(clinic.id);
    res.json(patients);
  } catch (err) {
    next(err);
  }
}