import { Request, Response, NextFunction } from "express";
import { saveVitalsSchema, updateVitalsSchema } from "./vitals.validation";
import * as vitalsService from "./vitals.service";

export async function save(req: Request, res: Response, next: NextFunction) {
  try {
    const input = saveVitalsSchema.parse(req.body);
    const record = await vitalsService.saveVitals(input);
    res.status(201).json(record);
  } catch (err) {
    next(err);
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const input = updateVitalsSchema.parse(req.body);
    const vitalsId = req.params.id as string;
    const record = await vitalsService.updateVitals(vitalsId, input);
    res.json(record);
  } catch (err) {
    next(err);
  }
}

export async function historyByPatient(req: Request, res: Response, next: NextFunction) {
  try {
    const patientId = req.params.patientId as string;
    const records = await vitalsService.getVitalsByPatient(patientId);
    res.json(records);
  } catch (err) {
    next(err);
  }
}

export async function historyByPhone(req: Request, res: Response, next: NextFunction) {
  try {
    const phone = req.params.phone as string;
    const records = await vitalsService.getVitalsByPhone(phone);
    res.json(records);
  } catch (err) {
    next(err);
  }
}

export async function getPatientByVitals(req: Request, res: Response, next: NextFunction) {
  try {
    const vitalsId = req.params.vitalsId as string;
    const result = await vitalsService.getPatientByVitalsId(vitalsId);
    if (!result) return res.status(404).json({ error: "Not found" });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function getFullReportHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const vitalsId = req.params.vitalsId as string;
    const result = await vitalsService.getFullReport(vitalsId);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}