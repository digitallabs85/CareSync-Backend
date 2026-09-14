import { z } from "zod";

export const vitalsSchema = z.object({
  pulseRate: z.number().int().optional(),
  bloodOxygen: z.number().int().optional(),
  systolic: z.number().int().optional(),
  diastolic: z.number().int().optional(),
  temperature: z.number().optional(),
  temperatureUnit: z.string().optional(),
  bloodSugar: z.string().optional(),
  weight: z.number().optional(),
  height: z.number().optional(),
  heightUnit: z.string().optional(),
  bmi: z.number().optional(),
  patientType: z.string().optional(),
});

export const saveVitalsSchema = z.object({
  patientId: z.string().uuid(),
  vitals: vitalsSchema,
});

export const updateVitalsSchema = z.object({
  vitals: vitalsSchema.partial(),
});

export type SaveVitalsInput = z.infer<typeof saveVitalsSchema>;
export type UpdateVitalsInput = z.infer<typeof updateVitalsSchema>;