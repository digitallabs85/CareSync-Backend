import { Router, Request, Response, NextFunction } from "express";
import * as c from "./admin.controller";
import { adminGate } from "../../middleware/adminGate.middleware";
import { adminAuth, requirePermission } from "../../middleware/adminAuth.middleware";
import { rateLimit } from "../../middleware/rateLimit.middleware";

const router = Router();

// 1. Only the admin portal's server can reach these endpoints (shared secret) — 404 otherwise.
router.use(adminGate);

// 2. Coarse per-IP flood protection for everything (including login).
router.use(rateLimit({ name: "admin-ip", max: 300, windowSec: 60 }));

// 3. Public: login (extra throttling on top; failed-attempt lockouts live in the service).
router.post("/login", rateLimit({ name: "admin-login-ip", max: 30, windowSec: 15 * 60 }), c.login);

// 4. Everything below needs a valid, DB-verified admin session.
router.use(adminAuth);

// Writes are additionally capped per admin.
const writeLimiter = rateLimit({ name: "admin-write", max: 60, windowSec: 60, key: (req) => req.admin!.id });
router.use((req: Request, res: Response, next: NextFunction) =>
  req.method === "GET" ? next() : writeLimiter(req, res, next)
);

// session
router.post("/logout", c.logout);
router.get("/me", c.me);
router.post("/me/password", rateLimit({ name: "admin-pw-change", max: 5, windowSec: 15 * 60, key: (req) => req.admin!.id }), c.changeOwnPassword);

// dashboard
router.get("/stats", requirePermission("dashboard:view"), c.stats);

// clinics
router.get("/clinics", requirePermission("clinics:view"), c.listClinics);
router.get("/clinics/:id", requirePermission("clinics:view"), c.getClinic);
router.post("/clinics", requirePermission("clinics:create"), c.createClinic);
router.patch("/clinics/:id", requirePermission("clinics:update"), c.updateClinic);
router.patch("/clinics/:id/status", requirePermission("clinics:update"), c.updateClinicStatus);
router.post("/clinics/:id/reset-password", requirePermission("clinics:update"), c.resetClinicPassword);
router.delete("/clinics/:id", requirePermission("clinics:delete"), c.deleteClinic);

// doctors
router.get("/doctors", requirePermission("doctors:view"), c.listDoctors);
router.get("/doctors/:id", requirePermission("doctors:view"), c.getDoctor);
router.post("/doctors", requirePermission("doctors:create"), c.createDoctor);
router.patch("/doctors/:id", requirePermission("doctors:update"), c.updateDoctor);
router.patch("/doctors/:id/status", requirePermission("doctors:update"), c.updateDoctorStatus);
router.post("/doctors/:id/reset-password", requirePermission("doctors:update"), c.resetDoctorPassword);
router.delete("/doctors/:id", requirePermission("doctors:delete"), c.deleteDoctor);

// doctor <-> clinic assignments
router.post("/doctor-clinic-assignments", requirePermission("assignments:manage"), c.assignDoctorToClinic);
router.delete("/doctor-clinic-assignments", requirePermission("assignments:manage"), c.unassignDoctorFromClinic);

// admins (super_admin only)
router.get("/admins", requirePermission("admins:view"), c.listAdmins);
router.post("/admins", requirePermission("admins:create"), c.createAdmin);
router.patch("/admins/:id", requirePermission("admins:update"), c.updateAdmin);
router.post("/admins/:id/reset-password", requirePermission("admins:update"), c.resetAdminPassword);
router.delete("/admins/:id", requirePermission("admins:delete"), c.deleteAdmin);

// audit
router.get("/audit-logs", requirePermission("audit:view"), c.auditLogs);

export default router;
