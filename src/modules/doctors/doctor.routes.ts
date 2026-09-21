import { Router } from "express";
import * as doctorController from "./doctor.controller";
import { authMiddleware } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/requireRole.middleware";

const router = Router();

router.post("/login", doctorController.login);
router.post("/register", authMiddleware, requireRole("clinic"), doctorController.register);
router.get("/me", authMiddleware, requireRole("doctor"), doctorController.me);
router.put("/:id", authMiddleware, requireRole("doctor"), doctorController.update);
router.patch("/change-password", authMiddleware, requireRole("doctor"), doctorController.changePassword);
router.patch("/status", authMiddleware, requireRole("doctor"), doctorController.updateStatus);
router.post("/logout", authMiddleware, requireRole("doctor"), doctorController.logout);
router.get("/", authMiddleware, doctorController.getAll);
router.get("/queue", authMiddleware, requireRole("doctor"), doctorController.queue);

// ── Clinic ↔ Doctor assignment ──
router.post("/:id/assign-self", authMiddleware, requireRole("clinic"), doctorController.assignSelfToDoctor);
router.get("/:id/clinics", authMiddleware, doctorController.getClinics);
router.get("/clinic/:clinicId", authMiddleware, doctorController.getDoctorsByClinic);
router.get("/clinic/:clinicId/assigned-doctor", authMiddleware, requireRole("clinic"), doctorController.getAssignedDoctor);

export default router;