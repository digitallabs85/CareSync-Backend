import { RtcTokenBuilder, RtcRole } from "agora-access-token";
import { eq } from "drizzle-orm";
import { db } from "../../db";
import { vitals, calls } from "../../db/schema";
import { env } from "../../config/env";

export async function generateAgoraToken(vitalsId: string, side: "patient" | "doctor") {
    const vitalsRecord = await db.query.vitals.findFirst({ where: eq(vitals.id, vitalsId) });
    if (!vitalsRecord) {
        const err: any = new Error("Vitals record not found");
        err.status = 404;
        throw err;
    }

    const uid = side === "patient" ? 1 : 2;
    const channelName = `consult-${vitalsId}`;
    const expireSeconds = 3600;
    const privilegeExpireTs = Math.floor(Date.now() / 1000) + expireSeconds;

    const token = RtcTokenBuilder.buildTokenWithUid(
        env.agoraAppId,
        env.agoraAppCertificate,
        channelName,
        uid,
        RtcRole.PUBLISHER,
        privilegeExpireTs
    );

    return { token, channelName, appId: env.agoraAppId, uid };
}
