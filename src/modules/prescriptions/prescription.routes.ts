import { Router } from "express";
import * as prescriptionController from "./prescription.controller";
import { authMiddleware } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/requireRole.middleware";

const router = Router();

router.post("/", authMiddleware, requireRole("doctor"), prescriptionController.save);
router.get("/today", authMiddleware, prescriptionController.getTodayAll);
router.get("/by-vitals/:vitalsId", authMiddleware, prescriptionController.getByVitalsId);
router.get("/:id", authMiddleware, prescriptionController.getById);

export default router;