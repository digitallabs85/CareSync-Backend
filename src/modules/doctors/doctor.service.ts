import bcrypt from "bcryptjs";
import jwt, { SignOptions } from "jsonwebtoken";
import { eq } from "drizzle-orm";
import { db } from "../../db";
import { doctors, doctorSessions, doctorLogs } from "../../db/schema";
import { env } from "../../config/env";
import type {
  DoctorLoginInput,
  DoctorRegisterInput,
  UpdateDoctorInput,
  ChangePasswordInput,
  UpdateStatusInput,
} from "./doctor.validation";

function stripPassword(doctor: any) {
  const { password, ...safe } = doctor;
  return safe;
}

export async function loginDoctor(input: DoctorLoginInput) {
  const doctor = await db.query.doctors.findFirst({
    where: eq(doctors.email, input.email),
  });
  if (!doctor) {
    const err: any = new Error("Invalid credentials");
    err.status = 401;
    throw err;
  }

  if (doctor.status !== "Active") {
    const err: any = new Error("Doctor account is inactive");
    err.status = 403;
    throw err;
  }

  const match = await bcrypt.compare(input.password, doctor.password);
  if (!match) {
    const err: any = new Error("Invalid credentials");
    err.status = 401;
    throw err;
  }

  const token = jwt.sign(
    { id: doctor.id, role: "doctor", email: doctor.email },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn as SignOptions["expiresIn"] }
  );

  await db.insert(doctorSessions).values({ doctorId: doctor.id });

  return { token, doctor: stripPassword(doctor) };
}

export async function registerDoctor(input: DoctorRegisterInput, clinicId: string) {
  const existing = await db.query.doctors.findFirst({
    where: eq(doctors.email, input.email),
  });
  if (existing) {
    const err: any = new Error("Email already registered");
    err.status = 409;
    throw err;
  }

  const hashed = await bcrypt.hash(input.password, env.bcryptSaltRounds);

  const [doctor] = await db.insert(doctors).values({
    ...input,
    password: hashed,
    clinicId,
  }).returning();

  const token = jwt.sign(
    { id: doctor.id, role: "doctor", email: doctor.email },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn as SignOptions["expiresIn"] }
  );

  return { token, doctor: stripPassword(doctor) };
}

export async function getDoctorProfile(doctorId: string) {
  const doctor = await db.query.doctors.findFirst({
    where: eq(doctors.id, doctorId),
  });
  if (!doctor) {
    const err: any = new Error("Doctor not found");
    err.status = 404;
    throw err;
  }
  return stripPassword(doctor);
}

export async function updateDoctorProfile(doctorId: string, input: UpdateDoctorInput) {
  const [updated] = await db.update(doctors)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(doctors.id, doctorId))
    .returning();

  if (!updated) {
    const err: any = new Error("Doctor not found");
    err.status = 404;
    throw err;
  }
  return stripPassword(updated);
}

export async function changeDoctorPassword(doctorId: string, input: ChangePasswordInput) {
  const doctor = await db.query.doctors.findFirst({
    where: eq(doctors.id, doctorId),
  });
  if (!doctor) {
    const err: any = new Error("Doctor not found");
    err.status = 404;
    throw err;
  }

  const match = await bcrypt.compare(input.oldPassword, doctor.password);
  if (!match) {
    const err: any = new Error("Old password is incorrect");
    err.status = 401;
    throw err;
  }

  const hashed = await bcrypt.hash(input.newPassword, env.bcryptSaltRounds);
  await db.update(doctors).set({ password: hashed }).where(eq(doctors.id, doctorId));

  return { success: true };
}

export async function updateDoctorStatus(doctorId: string, input: UpdateStatusInput) {
  const [updated] = await db.update(doctors)
    .set({ doctorStatus: input.status, onCall: false })
    .where(eq(doctors.id, doctorId))
    .returning();

  if (input.status === "offline" && input.reason) {
    await db.insert(doctorLogs).values({
      doctorId,
      action: "status_offline",
      reason: input.reason,
    });
  }

  return stripPassword(updated);
}

export async function logoutDoctor(doctorId: string, reason: string) {
  await db.update(doctors)
    .set({ doctorStatus: "offline", onCall: false })
    .where(eq(doctors.id, doctorId));

  await db.insert(doctorLogs).values({ doctorId, action: "logout", reason });

  const session = await db.query.doctorSessions.findFirst({
    where: eq(doctorSessions.doctorId, doctorId),
    orderBy: (s, { desc }) => [desc(s.loginAt)],
  });

  if (session && !session.logoutAt) {
    await db.update(doctorSessions)
      .set({ logoutAt: new Date(), logoutReason: reason })
      .where(eq(doctorSessions.id, session.id));
  }

  return { success: true };
}

export async function getAllDoctors(clinicId?: string) {
  if (clinicId) {
    return db.query.doctors.findMany({ where: eq(doctors.clinicId, clinicId) });
  }
  return db.query.doctors.findMany();
}