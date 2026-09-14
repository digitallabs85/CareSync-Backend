import { z } from "zod";

export const saveFcmTokenSchema = z.object({
  token: z.string().min(20),
});

export const removeFcmTokenSchema = z.object({
  fcmToken: z.string().min(20),
});

export const alertDoctorSchema = z.object({
  doctorId: z.string().uuid(),
  vitalsId: z.string().uuid(),
});

export const acceptCallSchema = z.object({
  vitalsId: z.string().uuid(),
});

export const endCallSchema = z.object({
  vitalsId: z.string().uuid(),
  reason: z.string().optional(),
});

export type SaveFcmTokenInput = z.infer<typeof saveFcmTokenSchema>;
export type RemoveFcmTokenInput = z.infer<typeof removeFcmTokenSchema>;
export type AlertDoctorInput = z.infer<typeof alertDoctorSchema>;
export type AcceptCallInput = z.infer<typeof acceptCallSchema>;
export type EndCallInput = z.infer<typeof endCallSchema>;