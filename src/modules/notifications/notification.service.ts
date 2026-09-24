import { eq, and } from "drizzle-orm";
import { db } from "../../db";
import { doctors, calls, vitals, patients } from "../../db/schema";
import { sendPushNotification } from "../../services/firebase";
import { END_CALL_REASONS } from "./notification.validation";

async function notifyCancelCall(doctorId: string, vitalsId: string) {
  const doctor = await db.query.doctors.findFirst({ where: eq(doctors.id, doctorId) });
  if (doctor?.fcmToken) {
    await sendPushNotification(
      doctor.fcmToken,
      "",
      "",
      { vitalsId, type: "cancel_call" }
    );
  }
}

export async function saveDoctorFcmToken(doctorId: string, token: string) {
  await db.update(doctors).set({ fcmToken: token }).where(eq(doctors.id, doctorId));
  return { success: true };
}

export async function removeDoctorFcmToken(doctorId: string) {
  await db.update(doctors).set({ fcmToken: null }).where(eq(doctors.id, doctorId));
  return { success: true };
}

export async function alertDoctor(doctorId: string, vitalsId: string) {
  console.log("[alertDoctor] called", { doctorId, vitalsId });

  const doctor = await db.query.doctors.findFirst({ where: eq(doctors.id, doctorId) });
  if (!doctor) {
    console.log("[alertDoctor] doctor not found");
    const err: any = new Error("Doctor not found");
    err.status = 404;
    throw err;
  }
  console.log("[alertDoctor] doctor found", { doctorStatus: doctor.doctorStatus, onCall: doctor.onCall, hasFcmToken: !!doctor.fcmToken });

  if (doctor.doctorStatus !== "online" || doctor.onCall) {
    console.log("[alertDoctor] doctor not available");
    const err: any = new Error("Doctor is not available");
    err.status = 409;
    throw err;
  }

  const [vitalsWithPatient] = await db
    .select({ firstName: patients.firstName })
    .from(vitals)
    .innerJoin(patients, eq(vitals.patientId, patients.id))
    .where(eq(vitals.id, vitalsId));

  const patientName = vitalsWithPatient?.firstName ?? "Patient";
  console.log("[alertDoctor] patient name resolved:", patientName);

  const [call] = await db.insert(calls).values({
    vitalsId,
    doctorId,
    status: "pending",
    agoraChannelName: `consult-${vitalsId}`,
  }).returning();
  console.log("[alertDoctor] call row created:", call.id);

  if (doctor.fcmToken) {
    console.log("[alertDoctor] sending push notification...");
    const result = await sendPushNotification(
      doctor.fcmToken,
      "Incoming Consultation Request",
      `${patientName} is waiting for consultation.`,
      { vitalsId, callId: call.id, type: "incoming_call", patientName }
    );
    console.log("[alertDoctor] push result:", result);
  } else {
    console.log("[alertDoctor] doctor has no fcmToken — push skipped");
  }

  return call;
}

export async function acceptCall(doctorId: string, vitalsId: string) {
  const call = await db.query.calls.findFirst({
    where: and(eq(calls.vitalsId, vitalsId), eq(calls.doctorId, doctorId), eq(calls.status, "pending")),
    orderBy: (c, { desc }) => [desc(c.requestedAt)],
  });
  if (!call) {
    const err: any = new Error("No pending call found");
    err.status = 404;
    throw err;
  }

  const [updated] = await db.update(calls)
    .set({ status: "accepted", acceptedAt: new Date() })
    .where(eq(calls.id, call.id))
    .returning();

  await db.update(doctors).set({ onCall: true }).where(eq(doctors.id, doctorId));

  // auto-mark as online consultation since a video call was actually accepted
  await db.update(vitals).set({ patientType: "Online Consultation" }).where(eq(vitals.id, vitalsId));

  return updated;
}

export async function getCallStatus(vitalsId: string) {
  const call = await db.query.calls.findFirst({
    where: eq(calls.vitalsId, vitalsId),
    orderBy: (c, { desc }) => [desc(c.requestedAt)],
  });
  if (!call) {
    const err: any = new Error("Call not found");
    err.status = 404;
    throw err;
  }
  return call;
}

export async function endCall(vitalsId: string, role: "clinic" | "doctor", reason?: string) {
  const call = await db.query.calls.findFirst({
    where: eq(calls.vitalsId, vitalsId),
    orderBy: (c, { desc }) => [desc(c.requestedAt)],
  });
  if (!call) {
    const err: any = new Error("Call not found");
    err.status = 404;
    throw err;
  }

  const status = reason && (END_CALL_REASONS as readonly string[]).includes(reason)
    ? reason
    : "completed";

  const isPatientSide = role === "clinic";
  const isMissedType = status === "doctor_not_responding";
  const wasPending = call.status === "pending";

  const [updated] = await db.update(calls)
    .set({
      status,
      ...(isMissedType ? { missedAt: new Date() } : {}),
      ...(isPatientSide ? { patientEndedAt: new Date() } : { doctorEndedAt: new Date() }),
    })
    .where(eq(calls.id, call.id))
    .returning();

  await db.update(doctors).set({ onCall: false }).where(eq(doctors.id, call.doctorId));

  // Any patient/clinic-side end while the call was still ringing must stop the doctor's ringtone —
  // not just the missed-call case.
  if (isPatientSide && wasPending) {
    await notifyCancelCall(call.doctorId, vitalsId);
  }

  return updated;
}

export async function doctorDeclineCall(doctorId: string, vitalsId: string) {
  const call = await db.query.calls.findFirst({
    where: and(eq(calls.vitalsId, vitalsId), eq(calls.doctorId, doctorId), eq(calls.status, "pending")),
    orderBy: (c, { desc }) => [desc(c.requestedAt)],
  });
  if (!call) {
    const err: any = new Error("No pending call found");
    err.status = 404;
    throw err;
  }
  const [updated] = await db.update(calls)
    .set({ status: "declined_by_doctor" })
    .where(eq(calls.id, call.id))
    .returning();
  return updated;
}

export async function patientDeclineCall(vitalsId: string) {
  const call = await db.query.calls.findFirst({
    where: and(eq(calls.vitalsId, vitalsId), eq(calls.status, "pending")),
    orderBy: (c, { desc }) => [desc(c.requestedAt)],
  });
  if (!call) {
    const err: any = new Error("No pending call found");
    err.status = 404;
    throw err;
  }
  const [updated] = await db.update(calls)
    .set({ status: "declined_by_patient" })
    .where(eq(calls.id, call.id))
    .returning();

  await notifyCancelCall(call.doctorId, vitalsId);

  return updated;
}