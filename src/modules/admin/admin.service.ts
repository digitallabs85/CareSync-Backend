import bcrypt from "bcryptjs";
import jwt, { SignOptions } from "jsonwebtoken";
import { eq } from "drizzle-orm";
import { db } from "../../db";
import { admins, clinics, doctors, auditLogs } from "../../db/schema";
import { env } from "../../config/env";
import type { AdminLoginInput, CreateClinicInput, UpdateStatusInput } from "./admin.validation";

async function logAudit(params: {
  actorId: string;
  actorName: string;
  actorRole: string;
  action: string;
  entityType?: string;
  entityId?: string;
  entityName?: string;
  description: string;
}) {
  await db.insert(auditLogs).values(params);
}

export async function loginAdmin(input: AdminLoginInput) {
  const admin = await db.query.admins.findFirst({
    where: eq(admins.username, input.username),
  });
  if (!admin) {
    const err: any = new Error("Invalid credentials");
    err.status = 401;
    throw err;
  }

  if (admin.status !== "Active") {
    const err: any = new Error("Admin account suspended");
    err.status = 403;
    throw err;
  }

  const match = await bcrypt.compare(input.password, admin.password);
  if (!match) {
    const err: any = new Error("Invalid credentials");
    err.status = 401;
    throw err;
  }

  const token = jwt.sign(
    { id: admin.id, role: admin.role, username: admin.username },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn as SignOptions["expiresIn"] }
  );

  await logAudit({
    actorId: admin.id,
    actorName: admin.username,
    actorRole: admin.role,
    action: "login",
    entityType: "admin",
    entityId: admin.id,
    entityName: admin.username,
    description: `Admin ${admin.username} logged in`,
  });

  const { password, ...safeAdmin } = admin;
  return { token, admin: safeAdmin };
}

export async function createClinic(input: CreateClinicInput, adminId: string, adminName: string) {
  const existing = await db.query.clinics.findFirst({
    where: eq(clinics.username, input.username),
  });
  if (existing) {
    const err: any = new Error("Username already taken");
    err.status = 409;
    throw err;
  }

  const hashed = await bcrypt.hash(input.password, env.bcryptSaltRounds);

  const [clinic] = await db.insert(clinics).values({
    username: input.username,
    password: hashed,
    name: input.name,
    country: input.country,
    city: input.city,
    province: input.province,
    createdByAdminId: adminId,
    createdByName: adminName,
  }).returning();

  await logAudit({
    actorId: adminId,
    actorName: adminName,
    actorRole: "admin",
    action: "create_clinic",
    entityType: "clinic",
    entityId: clinic.id,
    entityName: clinic.username,
    description: `Admin ${adminName} created clinic ${clinic.username}`,
  });

  const { password, ...safeClinic } = clinic;
  return safeClinic;
}

export async function updateClinicStatus(
  clinicId: string,
  status: UpdateStatusInput["status"],
  adminId: string,
  adminName: string
) {
  const [updated] = await db.update(clinics)
    .set({ status })
    .where(eq(clinics.id, clinicId))
    .returning();

  if (!updated) {
    const err: any = new Error("Clinic not found");
    err.status = 404;
    throw err;
  }

  await logAudit({
    actorId: adminId,
    actorName: adminName,
    actorRole: "admin",
    action: status === "Active" ? "activate_clinic" : "suspend_clinic",
    entityType: "clinic",
    entityId: clinicId,
    entityName: updated.username,
    description: `Admin ${adminName} set clinic ${updated.username} to ${status}`,
  });

  const { password, ...safeClinic } = updated;
  return safeClinic;
}

export async function updateDoctorStatus(
  doctorId: string,
  status: UpdateStatusInput["status"],
  adminId: string,
  adminName: string
) {
  const [updated] = await db.update(doctors)
    .set({ status })
    .where(eq(doctors.id, doctorId))
    .returning();

  if (!updated) {
    const err: any = new Error("Doctor not found");
    err.status = 404;
    throw err;
  }

  await logAudit({
    actorId: adminId,
    actorName: adminName,
    actorRole: "admin",
    action: status === "Active" ? "activate_doctor" : "suspend_doctor",
    entityType: "doctor",
    entityId: doctorId,
    entityName: `${updated.firstName} ${updated.lastName}`,
    description: `Admin ${adminName} set doctor ${updated.email} to ${status}`,
  });

  const { password, ...safeDoctor } = updated;
  return safeDoctor;
}

export async function getAllClinics() {
  const rows = await db.query.clinics.findMany();
  return rows.map(({ password, ...c }) => c);
}

export async function getAllDoctorsAdmin() {
  const rows = await db.query.doctors.findMany();
  return rows.map(({ password, ...d }) => d);
}

export async function getAuditLogs() {
  return db.query.auditLogs.findMany({
    orderBy: (a, { desc }) => [desc(a.createdAt)],
  });
}