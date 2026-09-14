import { Router } from "express";
import * as consultController from "./consult.controller";
import { authMiddleware } from "../../middleware/auth.middleware";

const router = Router();

router.get("/token/:vitalsId", authMiddleware, consultController.getToken);

export default router;