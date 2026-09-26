import { Router } from "express";
import * as patientController from "./patient.controller";
import { authMiddleware } from "../../middleware/auth.middleware";

const router = Router();

router.get("/", authMiddleware, patientController.find);
router.post("/save", authMiddleware, patientController.save);
router.get("/verify-token/:token", authMiddleware, patientController.verify);
router.get("/today-token/:phone", authMiddleware, patientController.todayToken);
router.get("/today", authMiddleware, patientController.getToday);


export default router;