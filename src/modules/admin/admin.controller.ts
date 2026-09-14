import { Request, Response, NextFunction } from "express";
import { adminLoginSchema, createClinicSchema } from "./admin.validation";
import { updateStatusSchema } from "./admin.validation";
import * as adminService from "./admin.service";

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const input = adminLoginSchema.parse(req.body);
    const result = await adminService.loginAdmin(input);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function createClinic(req: Request, res: Response, next: NextFunction) {
  try {
    const input = createClinicSchema.parse(req.body);
    const admin = (req as any).user;
    const clinic = await adminService.createClinic(input, admin.id, admin.username);
    res.status(201).json(clinic);
  } catch (err) {
    next(err);
  }
}


export async function updateClinicStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const input = updateStatusSchema.parse(req.body);
    const admin = (req as any).user;
    const clinicId = req.params.id as string;
    const result = await adminService.updateClinicStatus(clinicId, input.status, admin.id, admin.username);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function updateDoctorStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const input = updateStatusSchema.parse(req.body);
    const admin = (req as any).user;
    const doctorId = req.params.id as string;
    const result = await adminService.updateDoctorStatus(doctorId, input.status, admin.id, admin.username);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function getAllClinics(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await adminService.getAllClinics();
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function getAllDoctors(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await adminService.getAllDoctorsAdmin();
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function getAuditLogs(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await adminService.getAuditLogs();
    res.json(result);
  } catch (err) {
    next(err);
  }
}