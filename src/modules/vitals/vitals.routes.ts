import { Router } from "express";
import * as vitalsController from "./vitals.controller";
import { authMiddleware } from "../../middleware/auth.middleware";

const router = Router();

router.post("/", authMiddleware, vitalsController.save);
router.patch("/:id", authMiddleware, vitalsController.update);
router.get("/patient/:patientId", authMiddleware, vitalsController.historyByPatient);
router.get("/history-by-phone/:phone", authMiddleware, vitalsController.historyByPhone);

export default router;