import { z } from "zod";

export const doctorLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const doctorRegisterSchema = z.object({
  title: z.string().min(1),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  phone: z.string().optional(),
  gender: z.string().optional(),
  specializations: z.array(z.string()).default([]),
  qualifications: z.array(z.string()).default([]),
  pmdcNumber: z.string().optional(),
  experience: z.number().int().min(0).optional(),
  city: z.string().optional(),
});

// export const updateDoctorSchema = doctorRegisterSchema.partial().omit({ password: true });
export const updateDoctorSchema = z
  .object({
    title: z.string().min(1).max(20),
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    phone: z.string().max(20).nullable(),
    gender: z.string().nullable(),
    pmdcNumber: z.string().nullable(),
    experience: z.number().int().min(0).max(80),
    city: z.string().nullable(),
    specializations: z.array(z.string().min(1)),
    qualifications: z.array(z.string().min(1)),
    photo: z.string().url().startsWith("https://res.cloudinary.com/").nullable(),
  })
  .partial()
  .strict();

export const changePasswordSchema = z.object({
  oldPassword: z.string().min(1),
  newPassword: z.string().min(6),
});

export const updateStatusSchema = z.object({
  status: z.enum(["online", "offline"]),
  reason: z.string().optional(),
});

export const logoutSchema = z.object({
  reason: z.string().min(1),
});

// ── Doctor ↔ Clinic assignment ──
export const assignClinicSchema = z.object({
  clinicId: z.string().uuid(),
});

export const assignmentSchema = z.object({
  doctorId: z.string().uuid(),
  clinicId: z.string().uuid(),
});

export type AssignClinicInput = z.infer<typeof assignClinicSchema>;
export type AssignmentInput = z.infer<typeof assignmentSchema>;
export type DoctorLoginInput = z.infer<typeof doctorLoginSchema>;
export type DoctorRegisterInput = z.infer<typeof doctorRegisterSchema>;
export type UpdateDoctorInput = z.infer<typeof updateDoctorSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type UpdateStatusInput = z.infer<typeof updateStatusSchema>;
export type LogoutInput = z.infer<typeof logoutSchema>;