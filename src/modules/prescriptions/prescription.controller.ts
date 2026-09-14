import { Request, Response, NextFunction } from "express";
import { savePrescriptionSchema } from "./prescription.validation";
import * as prescriptionService from "./prescription.service";

export async function save(req: Request, res: Response, next: NextFunction) {
  try {
    const input = savePrescriptionSchema.parse(req.body);
    const doctor = (req as any).user;
    const result = await prescriptionService.savePrescription(input, doctor.id);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

export async function getById(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params.id as string;
    const result = await prescriptionService.getPrescriptionById(id);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function getByVitalsId(req: Request, res: Response, next: NextFunction) {
  try {
    const vitalsId = req.params.vitalsId as string;
    const result = await prescriptionService.getPrescriptionByVitalsId(vitalsId);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function getTodayAll(req: Request, res: Response, next: NextFunction) {
  try {
    const doctorId = req.query.doctorId as string | undefined;
    const result = await prescriptionService.getAllPrescriptionsToday(doctorId);
    res.json(result);
  } catch (err) {
    next(err);
  }
}