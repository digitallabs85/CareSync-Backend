import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { env } from "../config/env";

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: env.firebaseProjectId,
      clientEmail: env.firebaseClientEmail,
      privateKey: env.firebasePrivateKey,
    }),
  });
}

export async function sendPushNotification(
  fcmToken: string,
  title: string,
  body: string,
  data?: Record<string, string>
) {
  try {
    await getMessaging().send({
      token: fcmToken,
      notification: { title, body },
      data,
    });
    return { success: true };
  } catch (err: any) {
    console.error("FCM send error:", err.message);
    return { success: false, error: err.message };
  }
}