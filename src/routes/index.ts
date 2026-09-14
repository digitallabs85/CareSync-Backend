import { Router } from "express";
import authRoutes from "../modules/auth/auth.routes";
import adminRoutes from "../modules/admin/admin.routes";
import doctorRoutes from "../modules/doctors/doctor.routes";
import patientRoutes from "../modules/patients/patient.routes";
import vitalsRoutes from "../modules/vitals/vitals.routes";
import consultRoutes from "../modules/consults/consult.routes";
import notificationRoutes from "../modules/notifications/notification.routes";
import prescriptionRoutes from "../modules/prescriptions/prescription.routes";

const router = Router();

router.use("/auth", authRoutes);
router.use("/admin", adminRoutes);
router.use("/doctors", doctorRoutes);
router.use("/patients", patientRoutes);
router.use("/vitals", vitalsRoutes);
router.use("/consults", consultRoutes);
router.use("/notifications", notificationRoutes);
router.use("/prescriptions", prescriptionRoutes);

export default router;