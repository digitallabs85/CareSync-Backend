import { eq, desc } from "drizzle-orm";
import { db } from "../../db";
import { vitals, patients } from "../../db/schema";
import type { SaveVitalsInput, UpdateVitalsInput } from "./vitals.validation";

export async function saveVitals(input: SaveVitalsInput) {
  const patient = await db.query.patients.findFirst({
    where: eq(patients.id, input.patientId),
  });
  if (!patient) {
    const err: any = new Error("Patient not found");
    err.status = 404;
    throw err;
  }

  const [record] = await db.insert(vitals).values({
    patientId: input.patientId,
    ...input.vitals,
    temperature: input.vitals.temperature?.toString(),
    weight: input.vitals.weight?.toString(),
    height: input.vitals.height?.toString(),
    bmi: input.vitals.bmi?.toString(),
  }).returning();

  await db.update(patients)
    .set({ vitalsRecorded: true })
    .where(eq(patients.id, input.patientId));

  return record;
}

export async function updateVitals(vitalsId: string, input: UpdateVitalsInput) {
  const { temperature, weight, height, bmi, ...rest } = input.vitals;

  const [updated] = await db.update(vitals)
    .set({
      ...rest,
      ...(temperature !== undefined && { temperature: temperature.toString() }),
      ...(weight !== undefined && { weight: weight.toString() }),
      ...(height !== undefined && { height: height.toString() }),
      ...(bmi !== undefined && { bmi: bmi.toString() }),
    })
    .where(eq(vitals.id, vitalsId))
    .returning();

  if (!updated) {
    const err: any = new Error("Vitals record not found");
    err.status = 404;
    throw err;
  }

  return updated;
}

export async function getVitalsByPatient(patientId: string) {
  return db.query.vitals.findMany({
    where: eq(vitals.patientId, patientId),
    orderBy: [desc(vitals.createdAt)],
  });
}

export async function getVitalsByPhone(phone: string) {
  const patientRecords = await db.query.patients.findMany({
    where: (p, { eq }) => eq(p.phoneNumber, phone),
  });

  const patientIds = patientRecords.map((p) => p.id);
  if (patientIds.length === 0) return [];

  return db.query.vitals.findMany({
    where: (v, { inArray }) => inArray(v.patientId, patientIds),
    orderBy: [desc(vitals.createdAt)],
  });
}