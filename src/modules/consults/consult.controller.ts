import { Request, Response, NextFunction } from "express";
import * as consultService from "./consult.service";

export async function getToken(req: Request, res: Response, next: NextFunction) {
    try {
        const vitalsId = req.params.vitalsId as string;
        const user = (req as any).user;
        const side = user.role === "doctor" ? "doctor" : "patient";
        const result = await consultService.generateAgoraToken(vitalsId, side);
        res.json(result);
    } catch (err) {
        next(err);
    }
}
