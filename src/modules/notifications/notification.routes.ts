import { Router } from "express";
import * as notificationController from "./notification.controller";
import { authMiddleware } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/requireRole.middleware";

const router = Router();

router.post("/doctor-token", authMiddleware, requireRole("doctor"), notificationController.saveFcmToken);
router.delete("/doctor-token", authMiddleware, requireRole("doctor"), notificationController.removeFcmToken);
router.post("/alert-doctor", authMiddleware, requireRole("clinic"), notificationController.alert);
router.post("/accept-call", authMiddleware, requireRole("doctor"), notificationController.accept);
router.get("/call-status/:vitalsId", authMiddleware, notificationController.status);
router.post("/end-call", authMiddleware, notificationController.end);

export default router;