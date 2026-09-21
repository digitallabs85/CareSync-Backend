import { z } from "zod";

export const saveFcmTokenSchema = z.object({
  token: z.string().min(20),
});

export const removeFcmTokenSchema = z.object({}).optional();

export const alertDoctorSchema = z.object({
  doctorId: z.string().uuid(),
  vitalsId: z.string().uuid(),
});

export const acceptCallSchema = z.object({
  vitalsId: z.string().uuid(),
});

export const END_CALL_REASONS = [
  "completed",
  "declined_by_doctor",
  "declined_by_patient",
  "doctor_not_responding",
] as const;

export const endCallSchema = z.object({
  vitalsId: z.string().uuid(),
  reason: z.enum(END_CALL_REASONS).optional(),
});

export const doctorDeclineCallSchema = z.object({
  vitalsId: z.string().uuid(),
});

export const patientDeclineCallSchema = z.object({
  vitalsId: z.string().uuid(),
});

export type DoctorDeclineCallInput = z.infer<typeof doctorDeclineCallSchema>;
export type PatientDeclineCallInput = z.infer<typeof patientDeclineCallSchema>;
export type SaveFcmTokenInput = z.infer<typeof saveFcmTokenSchema>;
export type RemoveFcmTokenInput = z.infer<typeof removeFcmTokenSchema>;
export type AlertDoctorInput = z.infer<typeof alertDoctorSchema>;
export type AcceptCallInput = z.infer<typeof acceptCallSchema>;
export type EndCallInput = z.infer<typeof endCallSchema>;