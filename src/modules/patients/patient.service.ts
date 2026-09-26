import { eq, and, sql, desc, isNull } from "drizzle-orm";
import { db } from "../../db";
import { patients, dailyTokenCounters, globalCounters, vitals, prescriptions, doctorClinicAssignments } from "../../db/schema";
import type { SavePatientInput } from "./patient.validation";

function todayDate() {
    return new Date().toISOString().split("T")[0];
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

async function getNextMrNumber(): Promise<string> {
    const [row] = await db
        .insert(globalCounters)
        .values({ name: "mr_number", counter: 1 })
        .onConflictDoUpdate({
            target: globalCounters.name,
            set: { counter: sql`${globalCounters.counter} + 1` },
        })
        .returning({ counter: globalCounters.counter });
    return `MR${String(row.counter).padStart(6, "0")}`;
}

function norm(v: any) {
    return (v ?? "").toString().trim().toLowerCase();
}

async function findExistingMrNumber(input: SavePatientInput): Promise<string | null> {
    // global (cross-clinic) lookup by phone — then verify identity with name/dob/gender
    const candidates = await db.query.patients.findMany({
        where: eq(patients.phoneNumber, input.phoneNumber),
    });

    const match = candidates.find((p) =>
        norm(p.firstName) === norm(input.firstName) &&
        norm(p.lastName) === norm(input.lastName) &&
        norm(p.dob) === norm(input.dob) &&
        norm(p.gender) === norm(input.gender)
    );

    return match?.mrNumber ?? null;
}

export async function saveOrUpdatePatient(input: SavePatientInput, clinicId: string) {
    const today = todayDate();

    // same clinic, same day — update in place (avoid duplicate queue entries)
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

    // new visit today (new patient, or returning patient on a new day / different clinic)
    const tokenNumber = await getNextToken(clinicId, today);
    const existingMrNumber = await findExistingMrNumber(input);
    const mrNumber = existingMrNumber ?? await getNextMrNumber();

    const [created] = await db.insert(patients).values({
        ...input,
        clinicId,
        token: String(tokenNumber),
        tokenDate: today,
        mrNumber,
    }).returning();

    return created;
}

export async function findPatientByPhone(phone: string) {
    return db.query.patients.findFirst({
        where: eq(patients.phoneNumber, phone),
        orderBy: (p, { desc }) => [desc(p.createdAt)],
    });
}

export async function findPatientByMrNumber(mrNumber: string, clinicId: string) {
    return db.query.patients.findFirst({
        where: and(eq(patients.clinicId, clinicId), eq(patients.mrNumber, mrNumber)),
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
    return db.query.patients.findFirst({
        where: and(
            eq(patients.clinicId, clinicId),
            eq(patients.phoneNumber, phone),
            eq(patients.tokenDate, today)
        ),
    });
}

export async function getTodayPatients(clinicId: string) {
    const today = todayDate();

    const rows = await db
        .select({
            id: patients.id,
            clinicId: patients.clinicId,
            phoneNumber: patients.phoneNumber,
            firstName: patients.firstName,
            lastName: patients.lastName,
            age: patients.age,
            gender: patients.gender,
            token: patients.token,
            tokenDate: patients.tokenDate,
            mrNumber: patients.mrNumber,
            vitalsRecorded: patients.vitalsRecorded,
            vitalsId: vitals.id,
            prescriptionId: prescriptions.id, // add this
        })
        .from(patients)
        .leftJoin(vitals, eq(vitals.patientId, patients.id))
        .leftJoin(prescriptions, eq(prescriptions.vitalsId, vitals.id))
        .where(and(eq(patients.clinicId, clinicId), eq(patients.tokenDate, today)))
        .orderBy(patients.token, desc(vitals.createdAt));

    const seen = new Set<string>();
    return rows.filter((r) => {
        if (seen.has(r.id)) return false;
        seen.add(r.id);
        return true;
    });
}