import { eq, and, sql } from "drizzle-orm";
import { db } from "../../db";
import { patients, dailyTokenCounters } from "../../db/schema";
import type { SavePatientInput } from "./patient.validation";

function todayDate() {
  return new Date().toISOString().split("T")[0]; // "YYYY-MM-DD"
}

async function getNextToken(clinicId: string, date: string): Promise<number> {
  const [row] = await db
    .insert(dailyTokenCounters)
    .values({ clinicId, date, counter: 1 })
    .onConflictDoUpdate({
      target: [dailyTokenCounters.clinicId, dailyTokenCounters.date],
      set: { counter: sql`${dailyTokenCounters.counter} + 1` },
    })
    .returning({ counter: dailyTokenCounters.counter });

  return row.counter;
}

export async function saveOrUpdatePatient(input: SavePatientInput, clinicId: string) {
  const today = todayDate();

  const existingToday = await db.query.patients.findFirst({
    where: and(
      eq(patients.clinicId, clinicId),
      eq(patients.phoneNumber, input.phoneNumber),
      eq(patients.tokenDate, today)
    ),
  });

  if (existingToday) {
    const [updated] = await db.update(patients)
      .set({ ...input })
      .where(eq(patients.id, existingToday.id))
      .returning();
    return updated;
  }

  const tokenNumber = await getNextToken(clinicId, today);

  const [created] = await db.insert(patients).values({
    ...input,
    clinicId,
    token: String(tokenNumber),
    tokenDate: today,
  }).returning();

  return created;
}

export async function findPatientByPhone(phone: string, clinicId: string) {
  return db.query.patients.findFirst({
    where: and(eq(patients.clinicId, clinicId), eq(patients.phoneNumber, phone)),
    orderBy: (p, { desc }) => [desc(p.createdAt)],
  });
}

export async function verifyToken(token: string, clinicId: string) {
  const today = todayDate();
  const patient = await db.query.patients.findFirst({
    where: and(
      eq(patients.clinicId, clinicId),
      eq(patients.token, token),
      eq(patients.tokenDate, today)
    ),
  });
  if (!patient) {
    const err: any = new Error("Invalid or expired token");
    err.status = 404;
    throw err;
  }
  return patient;
}

export async function getTodayTokenByPhone(phone: string, clinicId: string) {
  const today = todayDate();
  const patient = await db.query.patients.findFirst({
    where: and(
      eq(patients.clinicId, clinicId),
      eq(patients.phoneNumber, phone),
      eq(patients.tokenDate, today)
    ),
  });
  return patient ?? null;
}