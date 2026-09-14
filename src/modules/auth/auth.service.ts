import bcrypt from "bcryptjs";
import jwt, { SignOptions } from "jsonwebtoken";
import { eq } from "drizzle-orm";
import { db } from "../../db";
import { clinics } from "../../db/schema";
import { env } from "../../config/env";
import type { SignupInput, LoginInput } from "./auth.validation";

export async function signupClinic(input: SignupInput) {
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
  }).returning();

  const { password, ...safeClinic } = clinic;
  return safeClinic;
}

export async function loginClinic(input: LoginInput) {
  const clinic = await db.query.clinics.findFirst({
    where: eq(clinics.username, input.username),
  });
  if (!clinic) {
    const err: any = new Error("Invalid credentials");
    err.status = 401;
    throw err;
  }

  if (clinic.status !== "Active") {
    const err: any = new Error("Clinic account is inactive");
    err.code = "CLINIC_INACTIVE";
    err.status = 403;
    throw err;
  }

  const match = await bcrypt.compare(input.password, clinic.password);
  if (!match) {
    const err: any = new Error("Invalid credentials");
    err.status = 401;
    throw err;
  }

  const token = jwt.sign(
    { id: clinic.id, role: "clinic", username: clinic.username },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn as SignOptions["expiresIn"] }
  );

  const { password, ...safeClinic } = clinic;
  const permissions = {
    demographic: clinic.pagesDemographic,
    vitals: clinic.pagesVitals,
    onlineConsultation: clinic.pagesOnlineConsultation,
    pharmacy: clinic.pagesPharmacy,
  };

  return { token, user: safeClinic, permissions, role: "clinic" };
}

export async function getClinicProfile(clinicId: string) {
  const clinic = await db.query.clinics.findFirst({
    where: eq(clinics.id, clinicId),
  });
  if (!clinic) {
    const err: any = new Error("Clinic not found");
    err.status = 404;
    throw err;
  }
  const { password, ...safeClinic } = clinic;
  const permissions = {
    demographic: clinic.pagesDemographic,
    vitals: clinic.pagesVitals,
    onlineConsultation: clinic.pagesOnlineConsultation,
    pharmacy: clinic.pagesPharmacy,
  };
  return { user: safeClinic, permissions };
}