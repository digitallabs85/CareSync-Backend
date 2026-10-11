import { Request, Response, NextFunction } from "express";
import {
  adminLoginSchema,
  assignmentSchema,
  changeOwnPasswordSchema,
  createAdminSchema,
  createClinicSchema,
  createDoctorSchema,
  idParamSchema,
  listAdminsQuerySchema,
  listAuditQuerySchema,
  listClinicsQuerySchema,
  listDoctorsQuerySchema,
  resetPasswordSchema,
  updateAdminSchema,
  updateClinicSchema,
  updateDoctorSchema,
  updateStatusSchema,
} from "./admin.validation";
import * as adminService from "./admin.service";
import { getClientIp } from "../../middleware/adminGate.middleware";

type Handler = (req: Request, res: Response) => Promise<unknown>;

// Forwards thrown errors (validation, 4xx from the service, DB errors) to the error handler.
const h =
  (fn: Handler) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

const actor = (req: Request) => req.admin!;
const idOf = (req: Request) => idParamSchema.parse(req.params).id;

// ── auth ──

export const login = h(async (req, res) => {
  const input = adminLoginSchema.parse(req.body);
  try {
    const result = await adminService.loginAdmin(input, getClientIp(req));
    res.json(result);
  } catch (err: any) {
    if (err?.retryAfter) res.setHeader("Retry-After", String(err.retryAfter));
    throw err;
  }
});

export const logout = h(async (req, res) => {
  await adminService.logoutAdmin(actor(req));
  res.json({ ok: true });
});

export const me = h(async (req, res) => {
  res.json({ admin: await adminService.getAdminProfile(actor(req).id) });
});

export const changeOwnPassword = h(async (req, res) => {
  await adminService.changeOwnPassword(actor(req), changeOwnPasswordSchema.parse(req.body));
  res.json({ ok: true });
});

// ── dashboard ──

export const stats = h(async (req, res) => {
  res.json(await adminService.getStats(actor(req)));
});

// ── clinics ──

export const listClinics = h(async (req, res) => {
  res.json(await adminService.listClinics(actor(req), listClinicsQuerySchema.parse(req.query)));
});
export const getClinic = h(async (req, res) => {
  res.json(await adminService.getClinic(actor(req), idOf(req)));
});
export const createClinic = h(async (req, res) => {
  res.status(201).json(await adminService.createClinic(actor(req), createClinicSchema.parse(req.body)));
});
export const updateClinic = h(async (req, res) => {
  res.json(await adminService.updateClinic(actor(req), idOf(req), updateClinicSchema.parse(req.body)));
});
export const updateClinicStatus = h(async (req, res) => {
  const { status } = updateStatusSchema.parse(req.body);
  res.json(await adminService.updateClinicStatus(actor(req), idOf(req), status));
});
export const resetClinicPassword = h(async (req, res) => {
  await adminService.resetClinicPassword(actor(req), idOf(req), resetPasswordSchema.parse(req.body).password);
  res.json({ ok: true });
});
export const deleteClinic = h(async (req, res) => {
  await adminService.deleteClinic(actor(req), idOf(req));
  res.json({ ok: true });
});

// ── doctors ──

export const listDoctors = h(async (req, res) => {
  res.json(await adminService.listDoctors(actor(req), listDoctorsQuerySchema.parse(req.query)));
});
export const getDoctor = h(async (req, res) => {
  res.json(await adminService.getDoctor(actor(req), idOf(req)));
});
export const createDoctor = h(async (req, res) => {
  res.status(201).json(await adminService.createDoctor(actor(req), createDoctorSchema.parse(req.body)));
});
export const updateDoctor = h(async (req, res) => {
  res.json(await adminService.updateDoctor(actor(req), idOf(req), updateDoctorSchema.parse(req.body)));
});
export const updateDoctorStatus = h(async (req, res) => {
  const { status } = updateStatusSchema.parse(req.body);
  res.json(await adminService.updateDoctorStatus(actor(req), idOf(req), status));
});
export const resetDoctorPassword = h(async (req, res) => {
  await adminService.resetDoctorPassword(actor(req), idOf(req), resetPasswordSchema.parse(req.body).password);
  res.json({ ok: true });
});
export const deleteDoctor = h(async (req, res) => {
  await adminService.deleteDoctor(actor(req), idOf(req));
  res.json({ ok: true });
});

// ── doctor ↔ clinic assignment ──

export const assignDoctorToClinic = h(async (req, res) => {
  const input = assignmentSchema.parse(req.body);
  res.status(201).json(await adminService.assignDoctorToClinic(actor(req), input.doctorId, input.clinicId));
});
export const unassignDoctorFromClinic = h(async (req, res) => {
  const input = assignmentSchema.parse(req.body);
  res.json(await adminService.unassignDoctorFromClinic(actor(req), input.doctorId, input.clinicId));
});

// ── admins ──

export const listAdmins = h(async (req, res) => {
  res.json(await adminService.listAdmins(actor(req), listAdminsQuerySchema.parse(req.query)));
});
export const createAdmin = h(async (req, res) => {
  res.status(201).json(await adminService.createAdmin(actor(req), createAdminSchema.parse(req.body)));
});
export const updateAdmin = h(async (req, res) => {
  res.json(await adminService.updateAdmin(actor(req), idOf(req), updateAdminSchema.parse(req.body)));
});
export const resetAdminPassword = h(async (req, res) => {
  await adminService.resetAdminPassword(actor(req), idOf(req), resetPasswordSchema.parse(req.body).password);
  res.json({ ok: true });
});
export const deleteAdmin = h(async (req, res) => {
  await adminService.deleteAdmin(actor(req), idOf(req));
  res.json({ ok: true });
});

// ── audit ──

export const auditLogs = h(async (req, res) => {
  res.json(await adminService.listAuditLogs(actor(req), listAuditQuerySchema.parse(req.query)));
});
