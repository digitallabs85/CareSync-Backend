import { z } from "zod";

const medicineSchema = z.object({
  medicineName: z.string().min(1),
  morning: z.boolean().default(false),
  afternoon: z.boolean().default(false),
  night: z.boolean().default(false),
  beforeMeal: z.boolean().default(false),
  afterMeal: z.boolean().default(true),
  dosage: z.string().optional(),
  duration: z.string().optional(),
});

export const savePrescriptionSchema = z.object({
  patientId: z.string().uuid(),
  vitalsId: z.string().uuid().optional(),
  diagnosis: z.string().optional(),
  hematologicalTest: z.string().optional(),
  radiologicalTest: z.string().optional(),
  clinicalNotes: z.string().optional(),
  medicines: z.array(medicineSchema).default([]),
});

export type SavePrescriptionInput = z.infer<typeof savePrescriptionSchema>;