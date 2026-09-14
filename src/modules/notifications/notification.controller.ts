import { Request, Response, NextFunction } from "express";
import {
  saveFcmTokenSchema,
  removeFcmTokenSchema,
  alertDoctorSchema,
  acceptCallSchema,
  endCallSchema,
} from "./notification.validation";
import * as notificationService from "./notification.service";

export async function saveFcmToken(req: Request, res: Response, next: NextFunction) {
  try {
    const input = saveFcmTokenSchema.parse(req.body);
    const doctor = (req as any).user;
    const result = await notificationService.saveDoctorFcmToken(doctor.id, input.token);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function removeFcmToken(req: Request, res: Response, next: NextFunction) {
  try {
    removeFcmTokenSchema.parse(req.body);
    const doctor = (req as any).user;
    const result = await notificationService.removeDoctorFcmToken(doctor.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function alert(req: Request, res: Response, next: NextFunction) {
  try {
    const input = alertDoctorSchema.parse(req.body);
    const result = await notificationService.alertDoctor(input.doctorId, input.vitalsId);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

export async function accept(req: Request, res: Response, next: NextFunction) {
  try {
    const input = acceptCallSchema.parse(req.body);
    const doctor = (req as any).user;
    const result = await notificationService.acceptCall(doctor.id, input.vitalsId);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function status(req: Request, res: Response, next: NextFunction) {
  try {
    const vitalsId = req.params.vitalsId as string;
    const result = await notificationService.getCallStatus(vitalsId);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function end(req: Request, res: Response, next: NextFunction) {
  try {
    const input = endCallSchema.parse(req.body);
    const user = (req as any).user;
    const result = await notificationService.endCall(input.vitalsId, user.role, input.reason);
    res.json(result);
  } catch (err) {
    next(err);
  }
}