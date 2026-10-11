import bcrypt from "bcryptjs";
import jwt, { SignOptions } from "jsonwebtoken";
import { and, asc, desc, eq, getTableColumns, ilike, or, sql, type SQL } from "drizzle-orm";
import { db } from "../../db";
import { admins, clinics, doctors, doctorClinicAssignments, auditLogs } from "../../db/schema";
import { env } from "../../config/env";
import { hit, peek, retryAfterSeconds } from "../../middleware/rateLimit.middleware";
import type { AdminActor } from "../../middleware/adminAuth.middleware";
import * as doctorService from "../doctors/doctor.service";
import { can, type Permission } from "./admin.permissions";
import type {
  AdminLoginInput,
  ChangeOwnPasswordInput,
  CreateAdminInput,
  CreateClinicInput,
  CreateDoctorInput,
  ListAdminsQuery,
  ListAuditQuery,
  ListClinicsQuery,
  ListDoctorsQuery,
  UpdateAdminInput,
  UpdateClinicInput,
  UpdateDoctorInput,
  UpdateStatusInput,
} from "./admin.validation";

// ────────────────────────────────────────────────────────────
// helpers
// ────────────────────────────────────────────────────────────

const SALT_ROUNDS = Math.max(env.bcryptSaltRounds, 12);

// Real bcrypt hash (cost 12) of a random string. Compared against when the
// username doesn't exist so "unknown user" and "wrong password" take the same time.
const DUMMY_HASH = "$2b$12$8WV2sDtAzzCALo5LAXuy4uoLvTervyEb1ss.jzBg2hnzH8HHIw03W";

function httpError(status: number, message: string, code?: string): never {
  const err: any = new Error(message);
  err.status = status;
  if (code) err.code = code;
  throw err;
}

function assertCan(actor: AdminActor, permission: Permission) {
  if (!can(actor.role, permission)) httpError(403, "You don't have permission to do that", "FORBIDDEN");
}

function dbErrorCode(err: any): string | undefined {
  return err?.code ?? err?.cause?.code;
}

function rethrowDbError(err: any, messages: { unique?: string; fk?: string }): never {
  const code = dbErrorCode(err);
  if (code === "23505") httpError(409, messages.unique ?? "That value is already in use");
  if (code === "23503") httpError(409, messages.fk ?? "This record is still referenced by other data");
  throw err;
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`);
const likePattern = (q: string) => `%${escapeLike(q.trim())}%`;

function diff(before: Record<string, any>, patch: Record<string, any>) {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of Object.keys(patch)) {
    if (patch[key] === undefined) continue;
    if (JSON.stringify(before[key]) !== JSON.stringify(patch[key])) {
      changes[key] = { from: before[key] ?? null, to: patch[key] };
    }
  }
  return changes;
}

async function audit(
  actor: AdminActor,
  entry: {
    action: string;
    entityType?: string;
    entityId?: string;
    entityName?: string;
    description: string;
    changes?: unknown;
  }
) {
  try {
    await db.insert(auditLogs).values({
      actorId: actor.id,
      actorName: actor.username,
      actorRole: actor.role,
      ipAddress: actor.ip,
      ...entry,
    });
  } catch (err) {
    // The action already happened; don't turn it into a 500 because logging failed.
    console.error("[audit] failed to write audit log", err);
  }
}

function paginate<T extends { total: number }>(rows: T[], page: number, limit: number) {
  const total = rows[0]?.total ?? 0;
  const items = rows.map(({ total: _t, ...rest }) => rest);
  return { items, total, page, limit };
}

// Columns that must never leave the server.
const { password: _clinicPw, ...clinicColumns } = getTableColumns(clinics);
const { password: _doctorPw, fcmToken: _doctorFcm, ...doctorColumns } = getTableColumns(doctors);
const { password: _adminPw, tokenVersion: _adminTv, ...adminColumns } = getTableColumns(admins);

// ────────────────────────────────────────────────────────────
// auth
// ────────────────────────────────────────────────────────────

const FAIL_WINDOWS = [
  { name: "login-fail-ip", max: 20, windowSec: 15 * 60 },
  { name: "login-fail-user-ip", max: 5, windowSec: 15 * 60 },
  { name: "login-fail-user", max: 30, windowSec: 60 * 60 },
] as const;

function failKeys(username: string, ip: string) {
  return [
    `${FAIL_WINDOWS[0].name}:${ip}`,
    `${FAIL_WINDOWS[1].name}:${username}:${ip}`,
    `${FAIL_WINDOWS[2].name}:${username}`,
  ];
}

export async function loginAdmin(input: AdminLoginInput, ip: string) {
  const username = input.username.toLowerCase();
  const keys = failKeys(username, ip);

  // Brute-force protection: refuse before doing any password work.
  const counts = await Promise.all(FAIL_WINDOWS.map((w, i) => peek(keys[i], w.windowSec)));
  const blocked = FAIL_WINDOWS.findIndex((w, i) => counts[i] >= w.max);
  if (blocked !== -1) {
    const err: any = new Error("Too many failed attempts. Try again later.");
    err.status = 429;
    err.code = "TOO_MANY_ATTEMPTS";
    err.retryAfter = retryAfterSeconds(FAIL_WINDOWS[blocked].windowSec);
    throw err;
  }

  const admin = await db.query.admins.findFirst({
    where: eq(sql`lower(${admins.username})`, username),
  });

  const match = await bcrypt.compare(input.password, admin?.password ?? DUMMY_HASH);

  if (!admin || !match) {
    await Promise.all(FAIL_WINDOWS.map((w, i) => hit(keys[i], w.windowSec)));
    httpError(401, "Invalid username or password");
  }

  if (admin.status !== "Active") httpError(403, "This account is suspended", "ACCOUNT_SUSPENDED");

  const token = jwt.sign(
    { id: admin.id, role: admin.role, username: admin.username, typ: "admin", tv: admin.tokenVersion },
    env.jwtSecret,
    { algorithm: "HS256", expiresIn: env.adminJwtExpiresIn as SignOptions["expiresIn"] }
  );

  await db.update(admins).set({ lastLoginAt: new Date() }).where(eq(admins.id, admin.id));

  await audit(
    { id: admin.id, username: admin.username, name: admin.name, role: admin.role as AdminActor["role"], ip },
    {
      action: "login",
      entityType: "admin",
      entityId: admin.id,
      entityName: admin.username,
      description: `Admin ${admin.username} logged in`,
    }
  );

  return { token, admin: await getAdminProfile(admin.id) };
}

export async function getAdminProfile(adminId: string) {
  const [admin] = await db.select(adminColumns).from(admins).where(eq(admins.id, adminId)).limit(1);
  if (!admin) httpError(404, "Admin not found");
  return admin;
}

/** Revokes every token issued so far for this admin (real server-side logout). */
export async function logoutAdmin(actor: AdminActor) {
  await db
    .update(admins)
    .set({ tokenVersion: sql`${admins.tokenVersion} + 1` })
    .where(eq(admins.id, actor.id));
  await audit(actor, {
    action: "logout",
    entityType: "admin",
    entityId: actor.id,
    entityName: actor.username,
    description: `Admin ${actor.username} logged out`,
  });
}

export async function changeOwnPassword(actor: AdminActor, input: ChangeOwnPasswordInput) {
  const admin = await db.query.admins.findFirst({ where: eq(admins.id, actor.id) });
  if (!admin) httpError(404, "Admin not found");

  const ok = await bcrypt.compare(input.currentPassword, admin.password);
  if (!ok) httpError(400, "Current password is incorrect", "INVALID_PASSWORD");
  if (input.currentPassword === input.newPassword) httpError(400, "New password must be different");

  await db
    .update(admins)
    .set({
      password: await bcrypt.hash(input.newPassword, SALT_ROUNDS),
      tokenVersion: sql`${admins.tokenVersion} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(admins.id, actor.id));

  await audit(actor, {
    action: "change_password",
    entityType: "admin",
    entityId: actor.id,
    entityName: actor.username,
    description: `Admin ${actor.username} changed their password`,
  });
}

// ────────────────────────────────────────────────────────────
// dashboard
// ────────────────────────────────────────────────────────────

export async function getStats(actor: AdminActor) {
  assertCan(actor, "dashboard:view");

  const [clinicStats, doctorStats, adminStats] = await Promise.all([
    db
      .select({
        total: sql<number>`count(*)::int`,
        active: sql<number>`(count(*) filter (where ${clinics.status} = 'Active'))::int`,
      })
      .from(clinics),
    db
      .select({
        total: sql<number>`count(*)::int`,
        active: sql<number>`(count(*) filter (where ${doctors.status} = 'Active'))::int`,
        online: sql<number>`(count(*) filter (where ${doctors.doctorStatus} = 'online'))::int`,
      })
      .from(doctors),
    can(actor.role, "admins:view")
      ? db
          .select({
            total: sql<number>`count(*)::int`,
            active: sql<number>`(count(*) filter (where ${admins.status} = 'Active'))::int`,
          })
          .from(admins)
      : Promise.resolve(null),
  ]);

  const c = clinicStats[0];
  const d = doctorStats[0];
  return {
    clinics: { total: c.total, active: c.active, suspended: c.total - c.active },
    doctors: { total: d.total, active: d.active, suspended: d.total - d.active, online: d.online },
    admins: adminStats ? { total: adminStats[0].total, active: adminStats[0].active } : null,
  };
}

// ────────────────────────────────────────────────────────────
// clinics
// ────────────────────────────────────────────────────────────

export async function listClinics(actor: AdminActor, query: ListClinicsQuery) {
  assertCan(actor, "clinics:view");

  const conditions: (SQL | undefined)[] = [];
  if (query.q) {
    const p = likePattern(query.q);
    conditions.push(
      or(ilike(clinics.name, p), ilike(clinics.username, p), ilike(clinics.clinicCode, p), ilike(clinics.city, p))
    );
  }
  if (query.status) conditions.push(eq(clinics.status, query.status));

  const sortColumn = { createdAt: clinics.createdAt, name: clinics.name, status: clinics.status }[query.sort];
  const order = query.dir === "asc" ? asc(sortColumn) : desc(sortColumn);

  const rows = await db
    .select({
      ...clinicColumns,
      // literal table names on purpose: drizzle drops qualifiers in single-table queries
      doctorCount: sql<number>`(select count(*)::int from doctor_clinic_assignments a where a.clinic_id = clinics.id)`,
      total: sql<number>`(count(*) over())::int`,
    })
    .from(clinics)
    .where(and(...conditions))
    .orderBy(order, asc(clinics.id))
    .limit(query.limit)
    .offset((query.page - 1) * query.limit);

  return paginate(rows, query.page, query.limit);
}

export async function getClinic(actor: AdminActor, clinicId: string) {
  assertCan(actor, "clinics:view");

  const [clinic] = await db.select(clinicColumns).from(clinics).where(eq(clinics.id, clinicId)).limit(1);
  if (!clinic) httpError(404, "Clinic not found");

  const assigned = await db
    .select({
      id: doctors.id,
      title: doctors.title,
      firstName: doctors.firstName,
      lastName: doctors.lastName,
      email: doctors.email,
      status: doctors.status,
      doctorStatus: doctors.doctorStatus,
      assignedAt: doctorClinicAssignments.createdAt,
    })
    .from(doctorClinicAssignments)
    .innerJoin(doctors, eq(doctors.id, doctorClinicAssignments.doctorId))
    .where(eq(doctorClinicAssignments.clinicId, clinicId))
    .orderBy(asc(doctors.firstName));

  return { ...clinic, doctors: assigned };
}

export async function createClinic(actor: AdminActor, input: CreateClinicInput) {
  assertCan(actor, "clinics:create");

  const existing = await db.query.clinics.findFirst({
    where: eq(sql`lower(${clinics.username})`, input.username.toLowerCase()),
    columns: { id: true },
  });
  if (existing) httpError(409, "Username already taken");

  const { password, ...rest } = input;
  let clinic;
  try {
    [clinic] = await db
      .insert(clinics)
      .values({
        ...rest,
        password: await bcrypt.hash(password, SALT_ROUNDS),
        createdByAdminId: actor.id,
        createdByName: actor.username,
      })
      .returning(clinicColumns);
  } catch (err) {
    rethrowDbError(err, { unique: "Username or clinic code already in use" });
  }

  await audit(actor, {
    action: "create_clinic",
    entityType: "clinic",
    entityId: clinic.id,
    entityName: clinic.username,
    description: `${actor.username} created clinic ${clinic.username}`,
  });
  return clinic;
}

export async function updateClinic(actor: AdminActor, clinicId: string, input: UpdateClinicInput) {
  assertCan(actor, "clinics:update");

  const [before] = await db.select(clinicColumns).from(clinics).where(eq(clinics.id, clinicId)).limit(1);
  if (!before) httpError(404, "Clinic not found");

  const changes = diff(before, input);
  if (Object.keys(changes).length === 0) return before;

  let updated;
  try {
    [updated] = await db.update(clinics).set(input).where(eq(clinics.id, clinicId)).returning(clinicColumns);
  } catch (err) {
    rethrowDbError(err, { unique: "Clinic code already in use" });
  }

  await audit(actor, {
    action: "update_clinic",
    entityType: "clinic",
    entityId: clinicId,
    entityName: updated.username,
    description: `${actor.username} updated clinic ${updated.username}`,
    changes,
  });
  return updated;
}

export async function updateClinicStatus(actor: AdminActor, clinicId: string, status: UpdateStatusInput["status"]) {
  assertCan(actor, "clinics:update");

  const [updated] = await db
    .update(clinics)
    .set({ status })
    .where(eq(clinics.id, clinicId))
    .returning(clinicColumns);
  if (!updated) httpError(404, "Clinic not found");

  await audit(actor, {
    action: status === "Active" ? "activate_clinic" : "suspend_clinic",
    entityType: "clinic",
    entityId: clinicId,
    entityName: updated.username,
    description: `${actor.username} set clinic ${updated.username} to ${status}`,
  });
  return updated;
}

export async function resetClinicPassword(actor: AdminActor, clinicId: string, password: string) {
  assertCan(actor, "clinics:update");

  const [updated] = await db
    .update(clinics)
    .set({ password: await bcrypt.hash(password, SALT_ROUNDS) })
    .where(eq(clinics.id, clinicId))
    .returning({ id: clinics.id, username: clinics.username });
  if (!updated) httpError(404, "Clinic not found");

  await audit(actor, {
    action: "reset_clinic_password",
    entityType: "clinic",
    entityId: clinicId,
    entityName: updated.username,
    description: `${actor.username} reset the password of clinic ${updated.username}`,
  });
}

export async function deleteClinic(actor: AdminActor, clinicId: string) {
  assertCan(actor, "clinics:delete");

  let deleted;
  try {
    [deleted] = await db.delete(clinics).where(eq(clinics.id, clinicId)).returning({ id: clinics.id, username: clinics.username });
  } catch (err) {
    rethrowDbError(err, {
      fk: "This clinic has consultation history and can't be deleted. Suspend it instead.",
    });
  }
  if (!deleted) httpError(404, "Clinic not found");

  await audit(actor, {
    action: "delete_clinic",
    entityType: "clinic",
    entityId: clinicId,
    entityName: deleted.username,
    description: `${actor.username} deleted clinic ${deleted.username}`,
  });
}

// ────────────────────────────────────────────────────────────
// doctors
// ────────────────────────────────────────────────────────────

const doctorFullName = sql`(${doctors.firstName} || ' ' || ${doctors.lastName})`;

export async function listDoctors(actor: AdminActor, query: ListDoctorsQuery) {
  assertCan(actor, "doctors:view");

  const conditions: (SQL | undefined)[] = [];
  if (query.q) {
    const p = likePattern(query.q);
    conditions.push(
      or(
        sql`${doctorFullName} ilike ${p}`,
        ilike(doctors.email, p),
        ilike(doctors.pmdcNumber, p),
        ilike(doctors.city, p)
      )
    );
  }
  if (query.status) conditions.push(eq(doctors.status, query.status));

  const sortColumn = {
    createdAt: doctors.createdAt,
    name: doctors.firstName,
    status: doctors.status,
  }[query.sort];
  const order = query.dir === "asc" ? asc(sortColumn) : desc(sortColumn);

  const rows = await db
    .select({
      ...doctorColumns,
      clinicCount: sql<number>`(select count(*)::int from doctor_clinic_assignments a where a.doctor_id = doctors.id)`,
      total: sql<number>`(count(*) over())::int`,
    })
    .from(doctors)
    .where(and(...conditions))
    .orderBy(order, asc(doctors.id))
    .limit(query.limit)
    .offset((query.page - 1) * query.limit);

  return paginate(rows, query.page, query.limit);
}

export async function getDoctor(actor: AdminActor, doctorId: string) {
  assertCan(actor, "doctors:view");

  const [doctor] = await db.select(doctorColumns).from(doctors).where(eq(doctors.id, doctorId)).limit(1);
  if (!doctor) httpError(404, "Doctor not found");

  const assigned = await db
    .select({
      id: clinics.id,
      name: clinics.name,
      username: clinics.username,
      city: clinics.city,
      status: clinics.status,
      assignedAt: doctorClinicAssignments.createdAt,
    })
    .from(doctorClinicAssignments)
    .innerJoin(clinics, eq(clinics.id, doctorClinicAssignments.clinicId))
    .where(eq(doctorClinicAssignments.doctorId, doctorId))
    .orderBy(asc(clinics.name));

  return { ...doctor, clinics: assigned };
}

export async function createDoctor(actor: AdminActor, input: CreateDoctorInput) {
  assertCan(actor, "doctors:create");

  const existing = await db.query.doctors.findFirst({
    where: eq(sql`lower(${doctors.email})`, input.email.toLowerCase()),
    columns: { id: true },
  });
  if (existing) httpError(409, "A doctor with this email already exists");

  const { password, ...rest } = input;
  let doctor;
  try {
    [doctor] = await db
      .insert(doctors)
      .values({ ...rest, password: await bcrypt.hash(password, SALT_ROUNDS) })
      .returning(doctorColumns);
  } catch (err) {
    rethrowDbError(err, { unique: "A doctor with this email already exists" });
  }

  await audit(actor, {
    action: "create_doctor",
    entityType: "doctor",
    entityId: doctor.id,
    entityName: `${doctor.firstName} ${doctor.lastName}`,
    description: `${actor.username} created doctor ${doctor.email}`,
  });
  return doctor;
}

export async function updateDoctor(actor: AdminActor, doctorId: string, input: UpdateDoctorInput) {
  assertCan(actor, "doctors:update");

  const [before] = await db.select(doctorColumns).from(doctors).where(eq(doctors.id, doctorId)).limit(1);
  if (!before) httpError(404, "Doctor not found");

  const changes = diff(before, input);
  if (Object.keys(changes).length === 0) return before;

  const [updated] = await db
    .update(doctors)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(doctors.id, doctorId))
    .returning(doctorColumns);

  await audit(actor, {
    action: "update_doctor",
    entityType: "doctor",
    entityId: doctorId,
    entityName: `${updated.firstName} ${updated.lastName}`,
    description: `${actor.username} updated doctor ${updated.email}`,
    changes,
  });
  return updated;
}

export async function updateDoctorStatus(actor: AdminActor, doctorId: string, status: UpdateStatusInput["status"]) {
  assertCan(actor, "doctors:update");

  const [updated] = await db
    .update(doctors)
    .set({ status, updatedAt: new Date() })
    .where(eq(doctors.id, doctorId))
    .returning(doctorColumns);
  if (!updated) httpError(404, "Doctor not found");

  await audit(actor, {
    action: status === "Active" ? "activate_doctor" : "suspend_doctor",
    entityType: "doctor",
    entityId: doctorId,
    entityName: `${updated.firstName} ${updated.lastName}`,
    description: `${actor.username} set doctor ${updated.email} to ${status}`,
  });
  return updated;
}

export async function resetDoctorPassword(actor: AdminActor, doctorId: string, password: string) {
  assertCan(actor, "doctors:update");

  const [updated] = await db
    .update(doctors)
    .set({ password: await bcrypt.hash(password, SALT_ROUNDS), updatedAt: new Date() })
    .where(eq(doctors.id, doctorId))
    .returning({ id: doctors.id, email: doctors.email, firstName: doctors.firstName, lastName: doctors.lastName });
  if (!updated) httpError(404, "Doctor not found");

  await audit(actor, {
    action: "reset_doctor_password",
    entityType: "doctor",
    entityId: doctorId,
    entityName: `${updated.firstName} ${updated.lastName}`,
    description: `${actor.username} reset the password of doctor ${updated.email}`,
  });
}

export async function deleteDoctor(actor: AdminActor, doctorId: string) {
  assertCan(actor, "doctors:delete");

  let deleted;
  try {
    [deleted] = await db
      .delete(doctors)
      .where(eq(doctors.id, doctorId))
      .returning({ id: doctors.id, email: doctors.email, firstName: doctors.firstName, lastName: doctors.lastName });
  } catch (err) {
    rethrowDbError(err, {
      fk: "This doctor has consultation history and can't be deleted. Suspend them instead.",
    });
  }
  if (!deleted) httpError(404, "Doctor not found");

  await audit(actor, {
    action: "delete_doctor",
    entityType: "doctor",
    entityId: doctorId,
    entityName: `${deleted.firstName} ${deleted.lastName}`,
    description: `${actor.username} deleted doctor ${deleted.email}`,
  });
}

// ────────────────────────────────────────────────────────────
// doctor ↔ clinic assignments
// ────────────────────────────────────────────────────────────

export async function assignDoctorToClinic(actor: AdminActor, doctorId: string, clinicId: string) {
  assertCan(actor, "assignments:manage");

  const [doctor, clinic] = await Promise.all([
    db.query.doctors.findFirst({ where: eq(doctors.id, doctorId) }),
    db.query.clinics.findFirst({ where: eq(clinics.id, clinicId) }),
  ]);
  if (!doctor) httpError(404, "Doctor not found");
  if (!clinic) httpError(404, "Clinic not found");

  const assignment = await doctorService.assignDoctorToClinic(doctorId, clinicId);

  await audit(actor, {
    action: "assign_doctor_clinic",
    entityType: "doctor_clinic_assignment",
    entityId: assignment.id,
    entityName: `${doctor.firstName} ${doctor.lastName} → ${clinic.username}`,
    description: `${actor.username} assigned doctor ${doctor.email} to clinic ${clinic.username}`,
  });
  return assignment;
}

export async function unassignDoctorFromClinic(actor: AdminActor, doctorId: string, clinicId: string) {
  assertCan(actor, "assignments:manage");

  const [doctor, clinic] = await Promise.all([
    db.query.doctors.findFirst({ where: eq(doctors.id, doctorId) }),
    db.query.clinics.findFirst({ where: eq(clinics.id, clinicId) }),
  ]);
  if (!doctor) httpError(404, "Doctor not found");
  if (!clinic) httpError(404, "Clinic not found");

  const deleted = await doctorService.unassignDoctorFromClinic(doctorId, clinicId);

  await audit(actor, {
    action: "unassign_doctor_clinic",
    entityType: "doctor_clinic_assignment",
    entityId: deleted.id,
    entityName: `${doctor.firstName} ${doctor.lastName} ✕ ${clinic.username}`,
    description: `${actor.username} unassigned doctor ${doctor.email} from clinic ${clinic.username}`,
  });
  return deleted;
}

// ────────────────────────────────────────────────────────────
// admins (super_admin only)
// ────────────────────────────────────────────────────────────

export async function listAdmins(actor: AdminActor, query: ListAdminsQuery) {
  assertCan(actor, "admins:view");

  const conditions: (SQL | undefined)[] = [];
  if (query.q) {
    const p = likePattern(query.q);
    conditions.push(or(ilike(admins.username, p), ilike(admins.name, p), ilike(admins.email, p)));
  }
  if (query.role) conditions.push(eq(admins.role, query.role));
  if (query.status) conditions.push(eq(admins.status, query.status));

  const rows = await db
    .select({ ...adminColumns, total: sql<number>`(count(*) over())::int` })
    .from(admins)
    .where(and(...conditions))
    .orderBy(desc(admins.createdAt), asc(admins.id))
    .limit(query.limit)
    .offset((query.page - 1) * query.limit);

  return paginate(rows, query.page, query.limit);
}

export async function createAdmin(actor: AdminActor, input: CreateAdminInput) {
  assertCan(actor, "admins:create");

  const existing = await db.query.admins.findFirst({
    where: eq(sql`lower(${admins.username})`, input.username.toLowerCase()),
    columns: { id: true },
  });
  if (existing) httpError(409, "Username already taken");

  const { password, ...rest } = input;
  let created;
  try {
    [created] = await db
      .insert(admins)
      .values({
        ...rest,
        username: rest.username.toLowerCase(),
        password: await bcrypt.hash(password, SALT_ROUNDS),
        createdByAdminId: actor.id,
        createdByName: actor.username,
      })
      .returning(adminColumns);
  } catch (err) {
    rethrowDbError(err, { unique: "Username already taken" });
  }

  await audit(actor, {
    action: "create_admin",
    entityType: "admin",
    entityId: created.id,
    entityName: created.username,
    description: `${actor.username} created ${created.role} account ${created.username}`,
  });
  return created;
}

export async function updateAdmin(actor: AdminActor, adminId: string, input: UpdateAdminInput) {
  assertCan(actor, "admins:update");

  // An admin can't change their own role or status (prevents locking the platform out
  // of its last super admin). They can still edit their own name/email.
  if (adminId === actor.id && (input.role !== undefined || input.status !== undefined)) {
    httpError(400, "You can't change your own role or status", "SELF_MODIFICATION");
  }

  const [before] = await db.select(adminColumns).from(admins).where(eq(admins.id, adminId)).limit(1);
  if (!before) httpError(404, "Admin not found");

  const changes = diff(before, input);
  if (Object.keys(changes).length === 0) return before;

  const roleOrStatusChanged = "role" in changes || "status" in changes;

  const [updated] = await db
    .update(admins)
    .set({
      ...input,
      updatedAt: new Date(),
      // role / status change should kick their existing sessions
      ...(roleOrStatusChanged ? { tokenVersion: sql`${admins.tokenVersion} + 1` } : {}),
    })
    .where(eq(admins.id, adminId))
    .returning(adminColumns);

  await audit(actor, {
    action: "update_admin",
    entityType: "admin",
    entityId: adminId,
    entityName: updated.username,
    description: `${actor.username} updated admin ${updated.username}`,
    changes,
  });
  return updated;
}

export async function resetAdminPassword(actor: AdminActor, adminId: string, password: string) {
  assertCan(actor, "admins:update");
  if (adminId === actor.id) httpError(400, "Use “Change password” for your own account", "SELF_MODIFICATION");

  const [updated] = await db
    .update(admins)
    .set({
      password: await bcrypt.hash(password, SALT_ROUNDS),
      tokenVersion: sql`${admins.tokenVersion} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(admins.id, adminId))
    .returning({ id: admins.id, username: admins.username });
  if (!updated) httpError(404, "Admin not found");

  await audit(actor, {
    action: "reset_admin_password",
    entityType: "admin",
    entityId: adminId,
    entityName: updated.username,
    description: `${actor.username} reset the password of admin ${updated.username}`,
  });
}

export async function deleteAdmin(actor: AdminActor, adminId: string) {
  assertCan(actor, "admins:delete");
  if (adminId === actor.id) httpError(400, "You can't delete your own account", "SELF_MODIFICATION");

  const [deleted] = await db
    .delete(admins)
    .where(eq(admins.id, adminId))
    .returning({ id: admins.id, username: admins.username });
  if (!deleted) httpError(404, "Admin not found");

  await audit(actor, {
    action: "delete_admin",
    entityType: "admin",
    entityId: adminId,
    entityName: deleted.username,
    description: `${actor.username} deleted admin ${deleted.username}`,
  });
}

// ────────────────────────────────────────────────────────────
// audit logs
// ────────────────────────────────────────────────────────────

export async function listAuditLogs(actor: AdminActor, query: ListAuditQuery) {
  assertCan(actor, "audit:view");

  const conditions: (SQL | undefined)[] = [];
  if (query.action) conditions.push(eq(auditLogs.action, query.action));
  if (query.q) {
    const p = likePattern(query.q);
    conditions.push(or(ilike(auditLogs.description, p), ilike(auditLogs.actorName, p)));
  }

  // Fetch one extra row instead of COUNT(*) over a growing table.
  const rows = await db
    .select()
    .from(auditLogs)
    .where(and(...conditions))
    .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
    .limit(query.limit + 1)
    .offset((query.page - 1) * query.limit);

  return {
    items: rows.slice(0, query.limit),
    page: query.page,
    limit: query.limit,
    hasMore: rows.length > query.limit,
  };
}
