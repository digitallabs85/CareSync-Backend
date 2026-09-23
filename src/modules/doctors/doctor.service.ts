import bcrypt from "bcryptjs";
import jwt, { SignOptions } from "jsonwebtoken";
import { eq, and, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../../db";
import { doctors, doctorSessions, doctorLogs, doctorClinicAssignments, clinics, vitals, patients, prescriptions, calls } from "../../db/schema";
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

  const [updated] = await db.update(doctors)
    .set({ doctorStatus: "offline", onCall: false })
    .where(eq(doctors.id, doctor.id))
    .returning();

  return { token, doctor: stripPassword(updated) };
}

// A clinic registering a doctor now creates the doctor AND an
// assignment row linking them to that clinic (was: doctors.clinicId).
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
  }).returning();

  await db.insert(doctorClinicAssignments).values({ doctorId: doctor.id, clinicId });

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

// clinicId now filters through the assignment table instead of a
// direct column on doctors.
export async function getAllDoctors(clinicId?: string) {
  if (clinicId) {
    return db.select({ doctor: doctors })
      .from(doctorClinicAssignments)
      .innerJoin(doctors, eq(doctors.id, doctorClinicAssignments.doctorId))
      .where(eq(doctorClinicAssignments.clinicId, clinicId))
      .then((rows) => rows.map((r) => stripPassword(r.doctor)));
  }
  const all = await db.query.doctors.findMany();
  return all.map(stripPassword);
}

// ── Doctor ↔ Clinic assignment management ──

export async function assignDoctorToClinic(doctorId: string, clinicId: string) {
  const doctor = await db.query.doctors.findFirst({ where: eq(doctors.id, doctorId) });
  if (!doctor) {
    const err: any = new Error("Doctor not found");
    err.status = 404;
    throw err;
  }

  const clinic = await db.query.clinics.findFirst({ where: eq(clinics.id, clinicId) });
  if (!clinic) {
    const err: any = new Error("Clinic not found");
    err.status = 404;
    throw err;
  }

  const existing = await db.query.doctorClinicAssignments.findFirst({
    where: and(eq(doctorClinicAssignments.doctorId, doctorId), eq(doctorClinicAssignments.clinicId, clinicId)),
  });
  if (existing) {
    const err: any = new Error("Doctor is already assigned to this clinic");
    err.status = 409;
    throw err;
  }

  const [assignment] = await db.insert(doctorClinicAssignments)
    .values({ doctorId, clinicId })
    .returning();

  return assignment;
}

export async function unassignDoctorFromClinic(doctorId: string, clinicId: string) {
  const [deleted] = await db.delete(doctorClinicAssignments)
    .where(and(eq(doctorClinicAssignments.doctorId, doctorId), eq(doctorClinicAssignments.clinicId, clinicId)))
    .returning();

  if (!deleted) {
    const err: any = new Error("Assignment not found");
    err.status = 404;
    throw err;
  }

  return deleted;
}

export async function getClinicsForDoctor(doctorId: string) {
  const rows = await db.select({ clinic: clinics })
    .from(doctorClinicAssignments)
    .innerJoin(clinics, eq(clinics.id, doctorClinicAssignments.clinicId))
    .where(eq(doctorClinicAssignments.doctorId, doctorId));
  return rows.map((r) => r.clinic);
}

export async function getDoctorsForClinic(clinicId: string) {
  const rows = await db.select({ doctor: doctors })
    .from(doctorClinicAssignments)
    .innerJoin(doctors, eq(doctors.id, doctorClinicAssignments.doctorId))
    .where(eq(doctorClinicAssignments.clinicId, clinicId));
  return rows.map((r) => stripPassword(r.doctor));
}

// Used by the kiosk flow — first available (online, not on call)
// doctor assigned to this clinic. No fairness/rotation yet.
export async function getAssignedDoctorForClinic(clinicId: string) {
  const rows = await db.select({ doctor: doctors })
    .from(doctorClinicAssignments)
    .innerJoin(doctors, eq(doctors.id, doctorClinicAssignments.doctorId))
    .where(and(
      eq(doctorClinicAssignments.clinicId, clinicId),
      eq(doctors.doctorStatus, "online"),
      eq(doctors.onCall, false),
    ));

  return rows.length > 0 ? rows[0].doctor : null;
}

export async function getDoctorQueue(doctorId: string) {
  const assignedClinics = await db.query.doctorClinicAssignments.findMany({
    where: eq(doctorClinicAssignments.doctorId, doctorId),
  });
  const clinicIds = assignedClinics.map((a) => a.clinicId);
  if (clinicIds.length === 0) return [];

  const queue = await db
    .select({
      vitalsId: vitals.id,
      patientId: patients.id,
      patientName: patients.firstName,
      token: patients.token,
      clinicId: patients.clinicId,
      tokenDate: patients.tokenDate,
      createdAt: vitals.createdAt,
    })
    .from(vitals)
    .innerJoin(patients, eq(vitals.patientId, patients.id))
    .leftJoin(prescriptions, eq(prescriptions.vitalsId, vitals.id))
    .leftJoin(
      calls,
      and(eq(calls.vitalsId, vitals.id), eq(calls.status, "accepted"))
    )
    .where(
      and(
        inArray(patients.clinicId, clinicIds),
        isNull(prescriptions.id),
        isNull(calls.id),
        eq(patients.vitalsRecorded, true),
        eq(patients.tokenDate, sql`CURRENT_DATE`)
      )
    )
    .orderBy(patients.token);

  return queue;
}