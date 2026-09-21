import { eq, desc } from "drizzle-orm";
import { db } from "../../db";
import { vitals, patients, prescriptions, doctors, prescriptionMedicines } from "../../db/schema";
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

export async function getPatientByVitalsId(vitalsId: string) {
  const [row] = await db
    .select({
      vitalsId: vitals.id,
      patientId: patients.id,
      firstName: patients.firstName,
      lastName: patients.lastName,
      token: patients.token,
      phoneNumber: patients.phoneNumber,
      dob: patients.dob,
      gender: patients.gender,
      mrNumber: patients.mrNumber,
    })
    .from(vitals)
    .innerJoin(patients, eq(vitals.patientId, patients.id))
    .where(eq(vitals.id, vitalsId));
  return row ?? null;
}

export async function getFullReport(vitalsId: string) {
  const [vitalsRow] = await db.select().from(vitals).where(eq(vitals.id, vitalsId));
  if (!vitalsRow) {
    const err: any = new Error("Vitals not found");
    err.status = 404;
    throw err;
  }

  const [patientRow] = await db
    .select({
      id: patients.id,
      firstName: patients.firstName,
      lastName: patients.lastName,
      token: patients.token,
      phoneNumber: patients.phoneNumber,
      age: patients.age,
      gender: patients.gender,
      city: patients.city,
    })
    .from(patients)
    .where(eq(patients.id, vitalsRow.patientId));

  const [prescriptionRow] = await db
    .select({
      id: prescriptions.id,
      diagnosis: prescriptions.diagnosis,
      hematologicalTest: prescriptions.hematologicalTest,
      radiologicalTest: prescriptions.radiologicalTest,
      clinicalNotes: prescriptions.clinicalNotes,
      createdAt: prescriptions.createdAt,
      updatedAt: prescriptions.updatedAt,
      doctorFirstName: doctors.firstName,
      doctorLastName: doctors.lastName,
      doctorTitle: doctors.title,
      doctorSpecializations: doctors.specializations,
    })
    .from(prescriptions)
    .innerJoin(doctors, eq(prescriptions.doctorId, doctors.id))
    .where(eq(prescriptions.vitalsId, vitalsId));

  let medicines: any[] = [];
  if (prescriptionRow) {
    medicines = await db
      .select()
      .from(prescriptionMedicines)
      .where(eq(prescriptionMedicines.prescriptionId, prescriptionRow.id));
  }

  return {
    patient: patientRow ?? null,
    vitals: vitalsRow,
    prescription: prescriptionRow
      ? {
          ...prescriptionRow,
          doctor: {
            name: `${prescriptionRow.doctorTitle} ${prescriptionRow.doctorFirstName} ${prescriptionRow.doctorLastName}`,
            specializations: prescriptionRow.doctorSpecializations,
          },
          medicines,
        }
      : null,
  };
}