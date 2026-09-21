import { Router } from "express";
import * as adminController from "./admin.controller";
import { authMiddleware } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/requireRole.middleware";

const router = Router();

router.post("/login", adminController.login);
router.post("/clinics", authMiddleware, requireRole("admin"), adminController.createClinic);
router.get("/clinics", authMiddleware, requireRole("admin"), adminController.getAllClinics);
router.patch("/clinics/:id/status", authMiddleware, requireRole("admin"), adminController.updateClinicStatus);
router.get("/doctors", authMiddleware, requireRole("admin"), adminController.getAllDoctors);
router.patch("/doctors/:id/status", authMiddleware, requireRole("admin"), adminController.updateDoctorStatus);
router.get("/audit-logs", authMiddleware, requireRole("admin"), adminController.getAuditLogs);

router.post("/doctor-clinic-assignments", authMiddleware, requireRole("admin"), adminController.assignDoctorToClinic);
router.delete("/doctor-clinic-assignments", authMiddleware, requireRole("admin"), adminController.unassignDoctorFromClinic);

export default router;