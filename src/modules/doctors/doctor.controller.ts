import { Request, Response, NextFunction } from "express";
import {
  doctorLoginSchema,
  doctorRegisterSchema,
  updateDoctorSchema,
  changePasswordSchema,
  updateStatusSchema,
  logoutSchema,
  assignClinicSchema,
  assignmentSchema,
} from "./doctor.validation";
import * as doctorService from "./doctor.service";

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const input = doctorLoginSchema.parse(req.body);
    const result = await doctorService.loginDoctor(input);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const input = doctorRegisterSchema.parse(req.body);
    const clinic = (req as any).user; // clinic JWT
    const result = await doctorService.registerDoctor(input, clinic.id);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

export async function me(req: Request, res: Response, next: NextFunction) {
  try {
    const doctor = (req as any).user;
    const result = await doctorService.getDoctorProfile(doctor.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const input = updateDoctorSchema.parse(req.body);
    const doctorId = req.params.id as string;
    const result = await doctorService.updateDoctorProfile(doctorId, input);
    res.json({ doctor: result });
  } catch (err) {
    next(err);
  }
}

export async function changePassword(req: Request, res: Response, next: NextFunction) {
  try {
    const input = changePasswordSchema.parse(req.body);
    const doctor = (req as any).user;
    const result = await doctorService.changeDoctorPassword(doctor.id, input);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function updateStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const input = updateStatusSchema.parse(req.body);
    const doctor = (req as any).user;
    const result = await doctorService.updateDoctorStatus(doctor.id, input);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function logout(req: Request, res: Response, next: NextFunction) {
  try {
    const input = logoutSchema.parse(req.body);
    const doctor = (req as any).user;
    const result = await doctorService.logoutDoctor(doctor.id, input.reason);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function getAll(req: Request, res: Response, next: NextFunction) {
  try {
    const clinicId = req.query.clinicId as string | undefined;
    const result = await doctorService.getAllDoctors(clinicId);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

// ── Assignment endpoints ──

// A clinic assigns itself an existing doctor (self-service, clinic-initiated)
export async function assignSelfToDoctor(req: Request, res: Response, next: NextFunction) {
  try {
    const doctorId = req.params.id as string;
    const clinic = (req as any).user;
    const result = await doctorService.assignDoctorToClinic(doctorId, clinic.id);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

// Admin assigns any doctor to any clinic
export async function adminAssign(req: Request, res: Response, next: NextFunction) {
  try {
    const input = assignmentSchema.parse(req.body);
    const result = await doctorService.assignDoctorToClinic(input.doctorId, input.clinicId);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

export async function adminUnassign(req: Request, res: Response, next: NextFunction) {
  try {
    const input = assignmentSchema.parse(req.body);
    const result = await doctorService.unassignDoctorFromClinic(input.doctorId, input.clinicId);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function getClinics(req: Request, res: Response, next: NextFunction) {
  try {
    const doctorId = req.params.id as string;
    const result = await doctorService.getClinicsForDoctor(doctorId);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function getDoctorsByClinic(req: Request, res: Response, next: NextFunction) {
  try {
    const clinicId = req.params.clinicId as string;
    const result = await doctorService.getDoctorsForClinic(clinicId);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function getAssignedDoctor(req: Request, res: Response, next: NextFunction) {
  try {
    const clinicId = req.params.clinicId as string;
    const doctor = await doctorService.getAssignedDoctorForClinic(clinicId);
    if (!doctor) return res.json({ success: false, error: "No doctor assigned" });
    res.json({ success: true, doctorId: doctor.id });
  } catch (err) {
    next(err);
  }
}

export async function queue(req: Request, res: Response, next: NextFunction) {
  try {
    const doctor = (req as any).user;
    const result = await doctorService.getDoctorQueue(doctor.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function getCompletedToday(req: Request, res: Response, next: NextFunction) {
  try {
    const doctor = (req as any).user;
    const result = await doctorService.getCompletedToday(doctor.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
}