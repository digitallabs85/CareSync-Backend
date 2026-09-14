import { eq, and } from "drizzle-orm";
import { db } from "../../db";
import { doctors, calls, vitals } from "../../db/schema";
import { sendPushNotification } from "../../services/firebase";

export async function saveDoctorFcmToken(doctorId: string, token: string) {
  await db.update(doctors).set({ fcmToken: token }).where(eq(doctors.id, doctorId));
  return { success: true };
}

export async function removeDoctorFcmToken(doctorId: string) {
  await db.update(doctors).set({ fcmToken: null }).where(eq(doctors.id, doctorId));
  return { success: true };
}


export async function alertDoctor(doctorId: string, vitalsId: string) {
  const doctor = await db.query.doctors.findFirst({ where: eq(doctors.id, doctorId) });
  if (!doctor) {
    const err: any = new Error("Doctor not found");
    err.status = 404;
    throw err;
  }
  if (doctor.doctorStatus !== "online" || doctor.onCall) {
    const err: any = new Error("Doctor is not available");
    err.status = 409;
    throw err;
  }

  const [call] = await db.insert(calls).values({
    vitalsId,
    doctorId,
    status: "pending",
    agoraChannelName: `consult-${vitalsId}`,
  }).returning();

  if (doctor.fcmToken) {
    await sendPushNotification(
      doctor.fcmToken,
      "Incoming Consultation Request",
      "A patient is waiting for consultation.",
      { vitalsId, callId: call.id, type: "incoming_call" }
    );
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

  const isPatientSide = role === "clinic";
  const [updated] = await db.update(calls)
    .set({
      status: "completed",
      ...(isPatientSide ? { patientEndedAt: new Date() } : { doctorEndedAt: new Date() }),
    })
    .where(eq(calls.id, call.id))
    .returning();

  await db.update(doctors).set({ onCall: false }).where(eq(doctors.id, call.doctorId));

  return updated;
}