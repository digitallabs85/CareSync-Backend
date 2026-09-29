import { eq, and, gte, desc, inArray, ilike, or } from "drizzle-orm";
import { db } from "../../db";
import { prescriptions, prescriptionMedicines, patients } from "../../db/schema";
import type { SavePrescriptionInput } from "./prescription.validation";

export async function savePrescription(input: SavePrescriptionInput, doctorId: string) {
  const patient = await db.query.patients.findFirst({
    where: eq(patients.id, input.patientId),
  });
  if (!patient) {
    const err: any = new Error("Patient not found");
    err.status = 404;
    throw err;
  }
  if (!patient.token) {
    const err: any = new Error("Patient has no active token for today");
    err.status = 400;
    throw err;
  }

  const [prescription] = await db.insert(prescriptions).values({
    patientId: input.patientId,
    doctorId,
    vitalsId: input.vitalsId,
    token: patient.token, // frozen at creation time — historical accuracy even after token resets
    diagnosis: input.diagnosis,
    hematologicalTest: input.hematologicalTest,
    radiologicalTest: input.radiologicalTest,
    clinicalNotes: input.clinicalNotes,
  }).returning();

  if (input.medicines.length > 0) {
    await db.insert(prescriptionMedicines).values(
      input.medicines.map((m) => ({ ...m, prescriptionId: prescription.id }))
    );
  }

  return getPrescriptionById(prescription.id);
}

export async function getPrescriptionById(prescriptionId: string) {
  const prescription = await db.query.prescriptions.findFirst({
    where: eq(prescriptions.id, prescriptionId),
  });
  if (!prescription) {
    const err: any = new Error("Prescription not found");
    err.status = 404;
    throw err;
  }

  const medicines = await db.query.prescriptionMedicines.findMany({
    where: eq(prescriptionMedicines.prescriptionId, prescriptionId),
  });

  return { ...prescription, medicines };
}

export async function getPrescriptionByVitalsId(vitalsId: string) {
  const prescription = await db.query.prescriptions.findFirst({
    where: eq(prescriptions.vitalsId, vitalsId),
  });
  if (!prescription) {
    const err: any = new Error("Prescription not found");
    err.status = 404;
    throw err;
  }
  return getPrescriptionById(prescription.id);
}

export async function getAllPrescriptionsToday(doctorId?: string) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const conditions = doctorId
    ? and(gte(prescriptions.createdAt, startOfDay), eq(prescriptions.doctorId, doctorId))
    : gte(prescriptions.createdAt, startOfDay);

  const rxList = await db.query.prescriptions.findMany({
    where: conditions,
    orderBy: [desc(prescriptions.createdAt)],
  });

  const patientIds = [...new Set(rxList.map(r => r.patientId))];
  const rxIds = rxList.map(r => r.id);

  const [patientRows, meds] = await Promise.all([
    patientIds.length ? db.query.patients.findMany({ where: inArray(patients.id, patientIds) }) : [],
    rxIds.length ? db.query.prescriptionMedicines.findMany({ where: inArray(prescriptionMedicines.prescriptionId, rxIds) }) : [],
  ]);

  return rxList.map(rx => ({
    ...rx,
    patient: patientRows.find(p => p.id === rx.patientId),
    medicines: meds.filter(m => m.prescriptionId === rx.id),
  }));
}

export async function searchPrescriptions(type: 'name' | 'token' | 'mrNumber', value: string) {
  let patientMatches;
  if (type === 'mrNumber') {
    patientMatches = await db.query.patients.findMany({ where: eq(patients.mrNumber, value) });
  } else if (type === 'token') {
    patientMatches = await db.query.patients.findMany({ where: eq(patients.token, value) });
  } else {
    patientMatches = await db.query.patients.findMany({
      where: or(ilike(patients.firstName, `%${value}%`), ilike(patients.lastName, `%${value}%`)),
    });
  }
  if (!patientMatches.length) return [];

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const patientIds = patientMatches.map(p => p.id);
  const rxList = await db.query.prescriptions.findMany({
    where: and(inArray(prescriptions.patientId, patientIds), gte(prescriptions.createdAt, startOfDay)),
    orderBy: [desc(prescriptions.createdAt)],
  });

  const rxIds = rxList.map(r => r.id);
  const meds = rxIds.length
    ? await db.query.prescriptionMedicines.findMany({ where: inArray(prescriptionMedicines.prescriptionId, rxIds) })
    : [];

  return rxList.map(rx => ({
    ...rx,
    patient: patientMatches.find(p => p.id === rx.patientId),
    medicines: meds.filter(m => m.prescriptionId === rx.id),
  }));
}