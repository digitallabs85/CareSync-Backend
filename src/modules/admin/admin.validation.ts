import { z } from "zod";

export const adminLoginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export const createClinicSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(6),
  name: z.string().optional(),
  country: z.string().optional(),
  city: z.string().optional(),
  province: z.string().optional(),
});

export const updateStatusSchema = z.object({
  status: z.enum(["Active", "Suspended"]),
});

export const assignmentSchema = z.object({
  doctorId: z.string().uuid(),
  clinicId: z.string().uuid(),
});

export type AssignmentInput = z.infer<typeof assignmentSchema>;
export type UpdateStatusInput = z.infer<typeof updateStatusSchema>;
export type AdminLoginInput = z.infer<typeof adminLoginSchema>;
export type CreateClinicInput = z.infer<typeof createClinicSchema>;