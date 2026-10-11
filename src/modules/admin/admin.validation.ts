import { z } from "zod";
import { ADMIN_ROLES } from "./admin.permissions";

// ── shared building blocks ──────────────────────────────────

export const idParamSchema = z.strictObject({ id: z.string().uuid() });

const trimmedOrNull = (max: number) =>
  z.string().trim().max(max).transform((v) => (v === "" ? null : v)).nullable().optional();

// bcrypt only uses the first 72 bytes, so cap there. Policy: 12+ chars with
// lower, upper, digit and symbol.
export const passwordSchema = z
  .string()
  .min(12, "At least 12 characters")
  .max(72, "At most 72 characters")
  .regex(/[a-z]/, "Add a lowercase letter")
  .regex(/[A-Z]/, "Add an uppercase letter")
  .regex(/[0-9]/, "Add a number")
  .regex(/[^A-Za-z0-9]/, "Add a symbol");

const statusSchema = z.enum(["Active", "Suspended"]);
const usernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(50)
  .regex(/^[a-zA-Z0-9._-]+$/, "Letters, numbers, dot, dash and underscore only");

// ── pagination / list queries ───────────────────────────────

const pageSchema = z.coerce.number().int().min(1).max(10000).default(1);
const limitSchema = z.coerce.number().int().min(1).max(50).default(15);
const searchSchema = z.string().trim().max(100).optional();
const dirSchema = z.enum(["asc", "desc"]).default("desc");

export const listClinicsQuerySchema = z.object({
  q: searchSchema,
  status: statusSchema.optional(),
  page: pageSchema,
  limit: limitSchema,
  sort: z.enum(["createdAt", "name", "status"]).default("createdAt"),
  dir: dirSchema,
});

export const listDoctorsQuerySchema = z.object({
  q: searchSchema,
  status: statusSchema.optional(),
  page: pageSchema,
  limit: limitSchema,
  sort: z.enum(["createdAt", "name", "status"]).default("createdAt"),
  dir: dirSchema,
});

export const listAdminsQuerySchema = z.object({
  q: searchSchema,
  role: z.enum(ADMIN_ROLES).optional(),
  status: statusSchema.optional(),
  page: pageSchema,
  limit: limitSchema,
});

export const listAuditQuerySchema = z.object({
  q: searchSchema,
  action: z.string().trim().max(60).optional(),
  page: pageSchema,
  limit: limitSchema,
});

// ── auth ────────────────────────────────────────────────────

export const adminLoginSchema = z.strictObject({
  username: z.string().trim().min(1).max(50),
  password: z.string().min(1).max(128),
});

export const changeOwnPasswordSchema = z.strictObject({
  currentPassword: z.string().min(1).max(128),
  newPassword: passwordSchema,
});

export const resetPasswordSchema = z.strictObject({ password: passwordSchema });

// ── clinics ─────────────────────────────────────────────────

const clinicFields = {
  name: z.string().trim().min(2).max(120),
  clinicCode: trimmedOrNull(20),
  location: z.string().trim().min(1).max(120),
  country: trimmedOrNull(80),
  province: trimmedOrNull(80),
  city: trimmedOrNull(80),
  isBifurcated: z.boolean(),
  priceVitals: z.number().int().min(0).max(1_000_000),
  priceBloodSugar: z.number().int().min(0).max(1_000_000),
  priceConsultancyGP: z.number().int().min(0).max(1_000_000),
  showPricing: z.boolean(),
  pagesDemographic: z.boolean(),
  pagesVitals: z.boolean(),
  pagesOnlineConsultation: z.boolean(),
  pagesPharmacy: z.boolean(),
};

export const createClinicSchema = z.strictObject({
  username: usernameSchema,
  password: passwordSchema,
  ...clinicFields,
  // everything except name/username/password is optional on create (DB defaults apply)
  location: clinicFields.location.optional(),
  isBifurcated: clinicFields.isBifurcated.optional(),
  priceVitals: clinicFields.priceVitals.optional(),
  priceBloodSugar: clinicFields.priceBloodSugar.optional(),
  priceConsultancyGP: clinicFields.priceConsultancyGP.optional(),
  showPricing: clinicFields.showPricing.optional(),
  pagesDemographic: clinicFields.pagesDemographic.optional(),
  pagesVitals: clinicFields.pagesVitals.optional(),
  pagesOnlineConsultation: clinicFields.pagesOnlineConsultation.optional(),
  pagesPharmacy: clinicFields.pagesPharmacy.optional(),
});

export const updateClinicSchema = z
  .strictObject(clinicFields)
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");

// ── doctors ─────────────────────────────────────────────────

const stringList = z.array(z.string().trim().min(1).max(80)).max(15);

const doctorFields = {
  title: z.string().trim().min(1).max(20),
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  phone: trimmedOrNull(20),
  gender: z.enum(["Male", "Female", "Other"]).nullable().optional(),
  specializations: stringList,
  qualifications: stringList,
  pmdcNumber: trimmedOrNull(40),
  experience: z.number().int().min(0).max(80),
  city: trimmedOrNull(80),
};

export const createDoctorSchema = z.strictObject({
  email: z.string().trim().toLowerCase().email().max(254),
  password: passwordSchema,
  ...doctorFields,
  specializations: doctorFields.specializations.optional(),
  qualifications: doctorFields.qualifications.optional(),
  experience: doctorFields.experience.optional(),
});

export const updateDoctorSchema = z
  .strictObject(doctorFields)
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");

// ── shared ──────────────────────────────────────────────────

export const updateStatusSchema = z.strictObject({ status: statusSchema });

export const assignmentSchema = z.strictObject({
  doctorId: z.string().uuid(),
  clinicId: z.string().uuid(),
});

// ── admins ──────────────────────────────────────────────────

export const createAdminSchema = z.strictObject({
  username: usernameSchema,
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().email().max(254),
  password: passwordSchema,
  role: z.enum(ADMIN_ROLES),
});

export const updateAdminSchema = z
  .strictObject({
    name: z.string().trim().min(2).max(100),
    email: z.string().trim().toLowerCase().email().max(254),
    role: z.enum(ADMIN_ROLES),
    status: statusSchema,
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");

export type AdminLoginInput = z.infer<typeof adminLoginSchema>;
export type ChangeOwnPasswordInput = z.infer<typeof changeOwnPasswordSchema>;
export type ListClinicsQuery = z.infer<typeof listClinicsQuerySchema>;
export type ListDoctorsQuery = z.infer<typeof listDoctorsQuerySchema>;
export type ListAdminsQuery = z.infer<typeof listAdminsQuerySchema>;
export type ListAuditQuery = z.infer<typeof listAuditQuerySchema>;
export type CreateClinicInput = z.infer<typeof createClinicSchema>;
export type UpdateClinicInput = z.infer<typeof updateClinicSchema>;
export type CreateDoctorInput = z.infer<typeof createDoctorSchema>;
export type UpdateDoctorInput = z.infer<typeof updateDoctorSchema>;
export type CreateAdminInput = z.infer<typeof createAdminSchema>;
export type UpdateAdminInput = z.infer<typeof updateAdminSchema>;
export type UpdateStatusInput = z.infer<typeof updateStatusSchema>;
export type AssignmentInput = z.infer<typeof assignmentSchema>;
