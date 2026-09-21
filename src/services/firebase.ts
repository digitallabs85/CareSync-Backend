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
    console.log("[sendPushNotification] sending to token:", fcmToken.slice(0, 20) + "...");
await getMessaging().send({
      token: fcmToken,
      notification: { title, body },
      data,
      webpush: {
        notification: {
          title,
          body,
          icon: "/icons/icon-192.png",
        },
        fcmOptions: {
          link: data?.type === "incoming_call"
            ? `/calls/incoming/${data.vitalsId}?name=${encodeURIComponent(data.patientName || "Patient")}`
            : "/dashboard",
        },
      },
    });
    console.log("[sendPushNotification] sent successfully");
    return { success: true };
  } catch (err: any) {
    console.error("FCM send error:", err.message);
    return { success: false, error: err.message };
  }
}