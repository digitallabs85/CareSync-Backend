#!/usr/bin/env bash
# CareSync backend — admin portal support (roles, rate limiting, search indexes).
# Run from the ROOT of CareSync-Backend (Git Bash):   bash apply-backend.sh
set -euo pipefail

if [ ! -f package.json ] || [ ! -d src/modules/admin ]; then
  echo "Run this from the CareSync-Backend root (the folder containing package.json and src/)." >&2
  exit 1
fi

# back up every file this script will overwrite
BACKUP=".backup-before-admin-portal"
mkdir -p "$BACKUP"
for f in "src/config/env.ts" "src/db/schema.ts" "src/db/seedSuperAdmin.ts" "src/middleware/adminAuth.middleware.ts" "src/middleware/adminGate.middleware.ts" "src/middleware/errorHandler.middleware.ts" "src/middleware/rateLimit.middleware.ts" "src/modules/admin/admin.controller.ts" "src/modules/admin/admin.permissions.ts" "src/modules/admin/admin.routes.ts" "src/modules/admin/admin.service.ts" "src/modules/admin/admin.validation.ts"; do
  if [ -f "$f" ]; then mkdir -p "$BACKUP/$(dirname "$f")"; cp "$f" "$BACKUP/$f"; fi
done
echo "Backed up existing files to $BACKUP/"

mkdir -p "$(dirname 'src/config/env.ts')"
cat > 'src/config/env.ts' <<'__CARESYNC_EOF__'
import dotenv from "dotenv";

dotenv.config();

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export const DEBUG = true;

// Vercel automatically sets VERCEL_ENV to "production", "preview", or "development"
// on every deployment — it's never set locally, so this reliably distinguishes
// "running on Vercel in production" from "running on my machine"
const isProduction = process.env.VERCEL_ENV === "production" || process.env.DEPLOY_TARGET === "production";

// Shared secret between the admin portal's server (Next.js) and this API.
// The admin API answers 404 to any request that doesn't carry it, so the admin
// endpoints can't be probed or brute-forced directly from the internet.
const adminProxySecret = requireEnv("ADMIN_PROXY_SECRET");
if (adminProxySecret.length < 32) {
  throw new Error("ADMIN_PROXY_SECRET must be at least 32 characters (use: openssl rand -hex 32)");
}

const jwtSecret = requireEnv("JWT_SECRET");
if (jwtSecret.length < 32) {
  console.warn("[env] JWT_SECRET is shorter than 32 characters — rotate it to a longer random value.");
}

export const env = {
  port: parseInt(process.env.PORT || "5000", 10),
  isProduction,
  bcryptSaltRounds: 10,
  adminEmail: requireEnv("ADMIN_EMAIL"),
  adminPassword: requireEnv("ADMIN_PASSWORD"),
  agoraAppId: requireEnv("AGORA_APP_ID"),
  agoraAppCertificate: requireEnv("AGORA_APP_CERTIFICATE"),
  firebaseProjectId: requireEnv("FIREBASE_PROJECT_ID"),
  firebaseClientEmail: requireEnv("FIREBASE_CLIENT_EMAIL"),
  firebasePrivateKey: requireEnv("FIREBASE_PRIVATE_KEY").replace(/\\n/g, "\n"),
  databaseUrl: isProduction
    ? requireEnv("PRODUCTION_DATABASE_URL")
    : requireEnv("DATABASE_URL"),
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  // Admin sessions are deliberately short-lived (clinic/doctor tokens keep JWT_EXPIRES_IN).
  adminJwtExpiresIn: process.env.ADMIN_JWT_EXPIRES_IN || "8h",
  adminProxySecret,
  clientUrls: isProduction
    ? [process.env.CLINIC_URL!, process.env.DOCTOR_URL!]
    : ["http://localhost:3000", "http://localhost:3001"],
};

console.log("CORS clientUrls:", env.clientUrls)
__CARESYNC_EOF__

mkdir -p "$(dirname 'src/db/schema.ts')"
cat > 'src/db/schema.ts' <<'__CARESYNC_EOF__'
// src/db/schema.ts
import { pgTable, text, timestamp, uuid, varchar, integer, numeric, boolean, jsonb, uniqueIndex, index, primaryKey, date, serial, pgEnum } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ────────────────────────────────────────────────────────────
// ADMIN
// Platform-level admins (not clinic staff, not doctors).
// role: "super_admin" | "admin" | "support"  (enforced in code, see admin.permissions.ts)
// ────────────────────────────────────────────────────────────
export const admins = pgTable("admins", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: varchar("username", { length: 50 }).notNull().unique(),
  name: text("name"),
  email: text("email"),
  password: text("password").notNull(),
  role: text("role").notNull().default("admin"),
  status: text("status").notNull().default("Active"),
  // Bumped on logout / password change / password reset. Tokens carry the
  // version they were issued with, so bumping it revokes every older token.
  tokenVersion: integer("token_version").notNull().default(0),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  createdByAdminId: uuid("created_by_admin_id"),
  createdByName: text("created_by_name"),
});

// Audit trail of admin actions (clinic suspended, doctor created, etc).
// actorId/actorName/actorRole kept denormalized so logs stay readable
// even if the acting admin is later deleted.
export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorId: uuid("actor_id").notNull(),
  actorName: text("actor_name").notNull(),
  actorRole: text("actor_role").notNull(),
  action: text("action").notNull(),
  entityType: text("entity_type"),
  entityId: text("entity_id"),
  entityName: text("entity_name"),
  description: text("description").notNull(),
  changes: jsonb("changes"),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("audit_created_at_idx").on(t.createdAt),
  index("audit_action_created_idx").on(t.action, t.createdAt),
  index("audit_description_trgm_idx").using("gin", t.description.op("gin_trgm_ops")),
]);

// Fixed-window counters used by the rate limiter / brute-force protection.
// Lives in Postgres because serverless instances (Vercel) share no memory.
export const rateLimits = pgTable("rate_limits", {
  key: text("key").notNull(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  count: integer("count").notNull().default(0),
}, (t) => [
  primaryKey({ columns: [t.key, t.windowStart] }),
  index("rate_limits_window_idx").on(t.windowStart),
]);

// ────────────────────────────────────────────────────────────
// CLINICS
// A clinic is the tenant/account that patients, kiosks, and
// walk-in flows belong to. Doctors are NOT owned by a clinic —
// see doctorClinicAssignments below for the many-to-many link.
// ────────────────────────────────────────────────────────────
export const clinics = pgTable("clinics", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: varchar("username", { length: 50 }).notNull().unique(),
  password: text("password").notNull(),
  name: text("name"),
  clinicCode: varchar("clinic_code", { length: 20 }).unique(),
  location: text("location").notNull().default("Pilot"),
  country: text("country"),
  city: text("city"),
  province: text("province"),
  status: text("status").notNull().default("Active"),
  createdByAdminId: uuid("created_by_admin_id"),
  createdByName: text("created_by_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  isBifurcated: boolean("is_bifurcated").notNull().default(false),

  // merged from pricing + page_permissions (1:1 tables, no reason to split)
  priceVitals: integer("price_vitals").notNull().default(0),
  priceBloodSugar: integer("price_blood_sugar").notNull().default(0),
  priceConsultancyGP: integer("price_consultancy_gp").notNull().default(0),
  showPricing: boolean("show_pricing").notNull().default(false),

  pagesDemographic: boolean("pages_demographic").notNull().default(true),
  pagesVitals: boolean("pages_vitals").notNull().default(true),
  pagesOnlineConsultation: boolean("pages_online_consultation").notNull().default(true),
  pagesPharmacy: boolean("pages_pharmacy").notNull().default(true),
}, (t) => [
  // trigram indexes make `ILIKE '%term%'` search fast (needs the pg_trgm extension)
  index("clinics_name_trgm_idx").using("gin", t.name.op("gin_trgm_ops")),
  index("clinics_username_trgm_idx").using("gin", t.username.op("gin_trgm_ops")),
  index("clinics_city_trgm_idx").using("gin", t.city.op("gin_trgm_ops")),
  index("clinics_code_trgm_idx").using("gin", t.clinicCode.op("gin_trgm_ops")),
  index("clinics_status_idx").on(t.status),
  index("clinics_created_at_idx").on(t.createdAt),
]);

// ────────────────────────────────────────────────────────────
// PATIENTS
// A patient record is scoped to one clinic (walk-in registration).
// Token/MR number are generated per clinic per day.
// ────────────────────────────────────────────────────────────
export const patients = pgTable("patients", {
  id: uuid("id").primaryKey().defaultRandom(),
  clinicId: uuid("clinic_id").notNull().references(() => clinics.id, { onDelete: "cascade" }),

  phoneNumber: text("phone_number").notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name"),
  age: integer("age").notNull(),
  gender: text("gender").notNull(),
  dob: text("dob"),

  country: text("country"),
  province: text("province"),
  city: text("city"),
  stAddress: text("st_address"),

  vitalsRecorded: boolean("vitals_recorded").notNull().default(false),
  fcmToken: text("fcm_token"),

  token: varchar("token", { length: 10 }),
  tokenDate: date("token_date"), // single ts, no separate date/time cols
  mrNumber: text("mr_number"),
  profilePhoto: text("profile_photo"),

  consentAccepted: boolean("consent_accepted").notNull().default(false),
  consentDate: timestamp("consent_date", { withTimezone: true }),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  // token only unique per clinic per day, not globally
  tokenPerClinicPerDay: uniqueIndex("token_clinic_date_idx").on(t.clinicId, t.token, t.tokenDate),
}));

// Backing counter used to generate the next daily token number per clinic.
export const dailyTokenCounters = pgTable("daily_token_counters", {
  id: uuid("id").primaryKey().defaultRandom(),
  clinicId: uuid("clinic_id").notNull().references(() => clinics.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  counter: integer("counter").notNull().default(0),
}, (table) => [
  uniqueIndex("clinic_date_idx").on(table.clinicId, table.date),
]);

// ────────────────────────────────────────────────────────────
// VITALS
// One patient can have multiple vitals records (e.g. repeat visits
// same day, or online-consult flow). Each vitals record is what a
// `calls` row and a `prescriptions` row hang off of.
// ────────────────────────────────────────────────────────────
export const vitals = pgTable("vitals", {
  id: uuid("id").primaryKey().defaultRandom(),
  patientId: uuid("patient_id").notNull().references(() => patients.id, { onDelete: "cascade" }),

  pulseRate: integer("pulse_rate"),
  bloodOxygen: integer("blood_oxygen"),
  systolic: integer("systolic"),
  diastolic: integer("diastolic"),

  temperature: numeric("temperature", { precision: 4, scale: 1 }),
  temperatureUnit: text("temperature_unit").default("F"),

  bloodSugar: text("blood_sugar").default("Not Performed"),

  weight: numeric("weight", { precision: 5, scale: 2 }),
  height: numeric("height", { precision: 5, scale: 2 }),
  heightUnit: text("height_unit").default("cm"),
  bmi: numeric("bmi", { precision: 4, scale: 1 }),

  patientType: text("patient_type").default("Walk-in"),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  // NOTE: no roomUrl/roomName/callStatus here anymore — that's all in `calls` now
});

// ────────────────────────────────────────────────────────────
// DOCTORS
// A doctor is independent of any clinic. Which clinics a doctor
// can serve is controlled entirely by doctorClinicAssignments —
// there is intentionally no clinicId column on this table.
// ────────────────────────────────────────────────────────────
export const doctors = pgTable("doctors", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: varchar("title", { length: 20 }).notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  phone: varchar("phone", { length: 20 }),
  gender: text("gender"),
  photo: text("photo"),
  specializations: jsonb("specializations").notNull().default([]),
  qualifications: jsonb("qualifications").notNull().default([]),
  pmdcNumber: text("pmdc_number"),
  experience: integer("experience").default(0),
  city: text("city"),
  doctorStatus: text("doctor_status").notNull().default("offline"), // online | offline
  status: text("status").notNull().default("Active"), // account status (Active/Suspended), set by admin
  onCall: boolean("on_call").notNull().default(false),
  fcmToken: text("fcm_token"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  // Full-name search: the query in admin.service.ts uses this exact expression.
  index("doctors_fullname_trgm_idx").using("gin", sql`(${t.firstName} || ' ' || ${t.lastName}) gin_trgm_ops`),
  index("doctors_email_trgm_idx").using("gin", t.email.op("gin_trgm_ops")),
  index("doctors_city_trgm_idx").using("gin", t.city.op("gin_trgm_ops")),
  index("doctors_pmdc_trgm_idx").using("gin", t.pmdcNumber.op("gin_trgm_ops")),
  index("doctors_status_idx").on(t.status),
  index("doctors_created_at_idx").on(t.createdAt),
]);

// Many-to-many link between doctors and clinics.
// A doctor can be assigned to any number of clinics; a clinic can
// have any number of assigned doctors. To list doctors available to
// a clinic: join this table on clinicId. To list clinics a doctor
// serves: join this table on doctorId.
export const doctorClinicAssignments = pgTable("doctor_clinic_assignments", {
  id: uuid("id").primaryKey().defaultRandom(),
  doctorId: uuid("doctor_id").notNull().references(() => doctors.id, { onDelete: "cascade" }),
  clinicId: uuid("clinic_id").notNull().references(() => clinics.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  doctorClinicUnique: uniqueIndex("doctor_clinic_unique_idx").on(t.doctorId, t.clinicId),
  clinicIdx: index("doctor_clinic_clinic_idx").on(t.clinicId),
}));

// Login/logout history per doctor (for shift tracking / audit).
export const doctorSessions = pgTable("doctor_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  doctorId: uuid("doctor_id").notNull().references(() => doctors.id, { onDelete: "cascade" }),
  loginAt: timestamp("login_at", { withTimezone: true }).defaultNow().notNull(),
  logoutAt: timestamp("logout_at", { withTimezone: true }),
  logoutReason: text("logout_reason"),
});

// Explicit logout-with-reason events (separate from doctorSessions —
// this is the "why did you go offline" log shown to admins).
export const doctorLogs = pgTable("doctor_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  doctorId: uuid("doctor_id").notNull().references(() => doctors.id, { onDelete: "cascade" }),
  action: text("action").notNull().default("logout"),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ────────────────────────────────────────────────────────────
// CALLS
// Single source of truth for a video-consult's lifecycle, keyed
// off a specific vitals record (not the patient directly) so a
// patient with multiple visits/vitals can have separate call
// histories per visit.
// ────────────────────────────────────────────────────────────
export const calls = pgTable("calls", {
  id: uuid("id").primaryKey().defaultRandom(),
  vitalsId: uuid("vitals_id").notNull().references(() => vitals.id),
  doctorId: uuid("doctor_id").notNull().references(() => doctors.id),

  status: text("status").notNull().default("pending"), // pending, accepted, missed, declined_by_doctor, declined_by_patient, doctor_not_responding, completed
  agoraChannelName: text("agora_channel_name"),

  requestedAt: timestamp("requested_at", { withTimezone: true }).defaultNow().notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  missedAt: timestamp("missed_at", { withTimezone: true }),
  patientEndedAt: timestamp("patient_ended_at", { withTimezone: true }),
  doctorEndedAt: timestamp("doctor_ended_at", { withTimezone: true }),
});

// ────────────────────────────────────────────────────────────
// PRESCRIPTIONS
// Written by a doctor for a patient, optionally tied to the
// specific vitals record that triggered the consult.
// ────────────────────────────────────────────────────────────
export const prescriptions = pgTable("prescriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  patientId: uuid("patient_id").notNull().references(() => patients.id, { onDelete: "cascade" }),
  doctorId: uuid("doctor_id").notNull().references(() => doctors.id, { onDelete: "cascade" }),
  vitalsId: uuid("vitals_id").references(() => vitals.id),
  token: varchar("token", { length: 10 }).notNull(),

  diagnosis: text("diagnosis"),
  hematologicalTest: text("hematological_test"),
  radiologicalTest: text("radiological_test"),
  clinicalNotes: text("clinical_notes"),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
});

// Line items (medicines) belonging to a prescription.
export const prescriptionMedicines = pgTable("prescription_medicines", {
  id: uuid("id").primaryKey().defaultRandom(),
  prescriptionId: uuid("prescription_id").notNull().references(() => prescriptions.id, { onDelete: "cascade" }),

  medicineName: text("medicine_name").notNull(),
  morning: boolean("morning").notNull().default(false),
  afternoon: boolean("afternoon").notNull().default(false),
  night: boolean("night").notNull().default(false),
  beforeMeal: boolean("before_meal").notNull().default(false),
  afterMeal: boolean("after_meal").notNull().default(true),

  dosage: text("dosage"),
  duration: text("duration"),
});

// ────────────────────────────────────────────────────────────
// MISC
// ────────────────────────────────────────────────────────────

// Generic named counters for anything needing a global sequence
// (not clinic- or date-scoped — dailyTokenCounters covers that case).
export const globalCounters = pgTable("global_counters", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 50 }).notNull().unique(),
  counter: integer("counter").notNull().default(0),
});

export const catalogTypeEnum = pgEnum('catalog_type', ['diagnosis', 'hematological', 'radiological']);

export const catalogItems = pgTable('catalog_items', {
  id: serial('id').primaryKey(),
  type: catalogTypeEnum('type').notNull(),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
}, (t) => ({
  uniq: uniqueIndex('catalog_type_name_uniq').on(t.type, t.name),
}));

export const medicines = pgTable('medicines', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  isActive: boolean('is_active').default(true).notNull(),
  priority: integer('priority').default(9999).notNull(),
});
__CARESYNC_EOF__

mkdir -p "$(dirname 'src/db/seedSuperAdmin.ts')"
cat > 'src/db/seedSuperAdmin.ts' <<'__CARESYNC_EOF__'
// Creates the first super admin, or promotes/resets an existing admin.
//
//   SUPER_ADMIN_USERNAME=owner SUPER_ADMIN_PASSWORD='Str0ng!Passphrase#2026' npm run db:seedSuperAdmin
//   (production: npm run db:seedSuperAdmin:prod with the same variables)
//
// Credentials come from the command line, never from the repo.
import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import { db } from "./index";
import { admins } from "./schema";

async function main() {
  const username = process.env.SUPER_ADMIN_USERNAME?.trim().toLowerCase();
  const password = process.env.SUPER_ADMIN_PASSWORD;
  const name = process.env.SUPER_ADMIN_NAME?.trim() || username;
  const email = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase() || null;

  if (!username || !/^[a-z0-9._-]{3,50}$/.test(username)) {
    throw new Error("Set SUPER_ADMIN_USERNAME (3-50 chars: a-z 0-9 . _ -)");
  }
  if (
    !password ||
    password.length < 12 ||
    password.length > 72 ||
    !/[a-z]/.test(password) ||
    !/[A-Z]/.test(password) ||
    !/[0-9]/.test(password) ||
    !/[^A-Za-z0-9]/.test(password)
  ) {
    throw new Error("Set SUPER_ADMIN_PASSWORD (12-72 chars with lower, upper, digit and symbol)");
  }

  const hash = await bcrypt.hash(password, 12);
  const existing = await db.query.admins.findFirst({
    where: eq(sql`lower(${admins.username})`, username),
    columns: { id: true },
  });

  if (existing) {
    await db
      .update(admins)
      .set({
        role: "super_admin",
        status: "Active",
        password: hash,
        tokenVersion: sql`${admins.tokenVersion} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(admins.id, existing.id));
    console.log(`✔ Promoted existing admin "${username}" to super_admin and reset the password.`);
  } else {
    await db.insert(admins).values({ username, name, email, password: hash, role: "super_admin", status: "Active" });
    console.log(`✔ Created super admin "${username}".`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("✖", err.message ?? err);
  process.exit(1);
});
__CARESYNC_EOF__

mkdir -p "$(dirname 'src/middleware/adminAuth.middleware.ts')"
cat > 'src/middleware/adminAuth.middleware.ts' <<'__CARESYNC_EOF__'
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { admins } from "../db/schema";
import { env } from "../config/env";
import { can, isAdminRole, type AdminRole, type Permission } from "../modules/admin/admin.permissions";
import { getClientIp } from "./adminGate.middleware";

export interface AdminActor {
  id: string;
  username: string;
  name: string | null;
  role: AdminRole;
  ip: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      admin?: AdminActor;
    }
  }
}

/**
 * Authenticates an admin on EVERY request against the database — the JWT only
 * proves identity. Role, status and token version always come from the DB, so
 * suspending an admin, changing their role, resetting their password or
 * logging out takes effect immediately instead of when the token expires.
 */
export async function adminAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  let payload: jwt.JwtPayload;
  try {
    const decoded = jwt.verify(header.slice(7), env.jwtSecret, { algorithms: ["HS256"] });
    if (typeof decoded === "string") throw new Error("bad payload");
    payload = decoded;
  } catch {
    return res.status(401).json({ error: "Invalid or expired session" });
  }

  if (payload.typ !== "admin" || typeof payload.id !== "string") {
    return res.status(401).json({ error: "Invalid or expired session" });
  }

  const admin = await db.query.admins.findFirst({
    where: eq(admins.id, payload.id),
    columns: { id: true, username: true, name: true, role: true, status: true, tokenVersion: true },
  });

  if (!admin || admin.status !== "Active" || admin.tokenVersion !== payload.tv || !isAdminRole(admin.role)) {
    return res.status(401).json({ error: "Invalid or expired session" });
  }

  req.admin = {
    id: admin.id,
    username: admin.username,
    name: admin.name,
    role: admin.role,
    ip: getClientIp(req),
  };
  next();
}

export function requirePermission(permission: Permission) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.admin) return res.status(401).json({ error: "Not authenticated" });
    if (!can(req.admin.role, permission)) {
      return res.status(403).json({ error: "You don't have permission to do that", code: "FORBIDDEN" });
    }
    next();
  };
}
__CARESYNC_EOF__

mkdir -p "$(dirname 'src/middleware/adminGate.middleware.ts')"
cat > 'src/middleware/adminGate.middleware.ts' <<'__CARESYNC_EOF__'
import crypto from "crypto";
import net from "net";
import { Request, Response, NextFunction } from "express";
import { env } from "../config/env";

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

/**
 * The admin API is only reachable through the admin portal's server (the Next.js
 * proxy), which adds a shared secret header. Anything else gets a plain 404, so
 * the admin endpoints can't be discovered, probed or brute-forced directly.
 */
export function adminGate(req: Request, res: Response, next: NextFunction) {
  const provided = req.header("x-admin-proxy-secret");
  if (!provided || !safeEqual(provided, env.adminProxySecret)) {
    return res.status(404).json({ error: "Not found" });
  }
  res.locals.viaAdminProxy = true;
  next();
}

/**
 * Real client IP. Behind the Next.js proxy every request arrives from Vercel's
 * network, so the proxy forwards the visitor's IP in `x-admin-client-ip`.
 * That header is only trusted once the shared secret has been verified.
 */
export function getClientIp(req: Request): string {
  if (res_viaProxy(req)) {
    const forwarded = req.header("x-admin-client-ip")?.trim();
    if (forwarded && net.isIP(forwarded)) return forwarded;
  }
  return req.ip || req.socket.remoteAddress || "unknown";
}

function res_viaProxy(req: Request): boolean {
  return (req.res?.locals as any)?.viaAdminProxy === true;
}
__CARESYNC_EOF__

mkdir -p "$(dirname 'src/middleware/errorHandler.middleware.ts')"
cat > 'src/middleware/errorHandler.middleware.ts' <<'__CARESYNC_EOF__'
import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { env } from "../config/env";

export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: "Validation failed", details: err.flatten() });
  }

  // body-parser errors (malformed JSON, payload too large)
  if (err?.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Malformed JSON body" });
  }
  if (err?.type === "entity.too.large") {
    return res.status(413).json({ error: "Request body too large" });
  }

  const status = err.status || 500;
  // Never leak internal error messages (SQL, stack hints) to clients in production.
  const message = status === 500 && env.isProduction ? "Internal server error" : err.message || "Internal server error";
  const response: any = { error: message };
  if (err.code && typeof err.code === "string" && status !== 500) response.code = err.code;

  if (status === 500) console.error(err);
  res.status(status).json(response);
}
__CARESYNC_EOF__

mkdir -p "$(dirname 'src/middleware/rateLimit.middleware.ts')"
cat > 'src/middleware/rateLimit.middleware.ts' <<'__CARESYNC_EOF__'
import { Request, Response, NextFunction } from "express";
import { and, eq, lt, sql } from "drizzle-orm";
import { db } from "../db";
import { rateLimits } from "../db/schema";
import { getClientIp } from "./adminGate.middleware";

// Fixed-window counters stored in Postgres. In-memory limiters don't work on
// Vercel (each invocation can be a fresh instance), so state lives in Neon.

function windowStartFor(windowSec: number): Date {
  const ms = windowSec * 1000;
  return new Date(Math.floor(Date.now() / ms) * ms);
}

/** Increment a counter and return its new value for the current window. */
export async function hit(key: string, windowSec: number): Promise<number> {
  const windowStart = windowStartFor(windowSec);
  const [row] = await db
    .insert(rateLimits)
    .values({ key, windowStart, count: 1 })
    .onConflictDoUpdate({
      target: [rateLimits.key, rateLimits.windowStart],
      set: { count: sql`${rateLimits.count} + 1` },
    })
    .returning({ count: rateLimits.count });

  // Opportunistic cleanup (~1% of calls) so the table never grows unbounded.
  if (Math.random() < 0.01) {
    void db
      .delete(rateLimits)
      .where(lt(rateLimits.windowStart, new Date(Date.now() - 24 * 60 * 60 * 1000)))
      .catch(() => {});
  }
  return row.count;
}

/** Read a counter without incrementing it. */
export async function peek(key: string, windowSec: number): Promise<number> {
  const windowStart = windowStartFor(windowSec);
  const [row] = await db
    .select({ count: rateLimits.count })
    .from(rateLimits)
    .where(and(eq(rateLimits.key, key), eq(rateLimits.windowStart, windowStart)))
    .limit(1);
  return row?.count ?? 0;
}

export function retryAfterSeconds(windowSec: number): number {
  const end = windowStartFor(windowSec).getTime() + windowSec * 1000;
  return Math.max(1, Math.ceil((end - Date.now()) / 1000));
}

interface Options {
  name: string;
  max: number;
  windowSec: number;
  /** Defaults to the client IP. */
  key?: (req: Request) => string;
}

export function rateLimit(opts: Options) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = opts.key ? opts.key(req) : getClientIp(req);
      const count = await hit(`${opts.name}:${id}`, opts.windowSec);
      if (count > opts.max) {
        res.setHeader("Retry-After", String(retryAfterSeconds(opts.windowSec)));
        return res.status(429).json({ error: "Too many requests. Please slow down.", code: "RATE_LIMITED" });
      }
      next();
    } catch (err) {
      // Fail closed: if we can't count, don't let the request through unmetered.
      console.error("[rateLimit] error", err);
      res.status(503).json({ error: "Service temporarily unavailable" });
    }
  };
}
__CARESYNC_EOF__

mkdir -p "$(dirname 'src/modules/admin/admin.controller.ts')"
cat > 'src/modules/admin/admin.controller.ts' <<'__CARESYNC_EOF__'
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
__CARESYNC_EOF__

mkdir -p "$(dirname 'src/modules/admin/admin.permissions.ts')"
cat > 'src/modules/admin/admin.permissions.ts' <<'__CARESYNC_EOF__'
// Single source of truth for what each admin role may do.
// Enforced on the server in two places: route middleware (requirePermission)
// and again inside the service layer (assertCan). The frontend only mirrors
// this to hide buttons — it is never what protects anything.

export const ADMIN_ROLES = ["super_admin", "admin", "support"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export type Permission =
  | "dashboard:view"
  | "clinics:view" | "clinics:create" | "clinics:update" | "clinics:delete"
  | "doctors:view" | "doctors:create" | "doctors:update" | "doctors:delete"
  | "assignments:manage"
  | "audit:view"
  | "admins:view" | "admins:create" | "admins:update" | "admins:delete";

// support: read-only
const SUPPORT: Permission[] = ["dashboard:view", "clinics:view", "doctors:view"];

// admin: day-to-day operations, but cannot create admins and cannot delete anything
const ADMIN: Permission[] = [
  ...SUPPORT,
  "clinics:create", "clinics:update",
  "doctors:create", "doctors:update",
  "assignments:manage",
  "audit:view",
];

// super_admin: everything
const SUPER_ADMIN: Permission[] = [
  ...ADMIN,
  "clinics:delete", "doctors:delete",
  "admins:view", "admins:create", "admins:update", "admins:delete",
];

const MATRIX: Record<AdminRole, ReadonlySet<Permission>> = {
  super_admin: new Set(SUPER_ADMIN),
  admin: new Set(ADMIN),
  support: new Set(SUPPORT),
};

export function isAdminRole(value: unknown): value is AdminRole {
  return typeof value === "string" && (ADMIN_ROLES as readonly string[]).includes(value);
}

export function can(role: unknown, permission: Permission): boolean {
  return isAdminRole(role) && MATRIX[role].has(permission);
}
__CARESYNC_EOF__

mkdir -p "$(dirname 'src/modules/admin/admin.routes.ts')"
cat > 'src/modules/admin/admin.routes.ts' <<'__CARESYNC_EOF__'
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
__CARESYNC_EOF__

mkdir -p "$(dirname 'src/modules/admin/admin.service.ts')"
cat > 'src/modules/admin/admin.service.ts' <<'__CARESYNC_EOF__'
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
__CARESYNC_EOF__

mkdir -p "$(dirname 'src/modules/admin/admin.validation.ts')"
cat > 'src/modules/admin/admin.validation.ts' <<'__CARESYNC_EOF__'
import { z } from "zod";
import { ADMIN_ROLES } from "./admin.permissions";

// ── shared building blocks ──────────────────────────────────

export const idParamSchema = z.strictObject({ id: z.string().uuid() });

const trimmedOrNull = (max: number) =>
  z.string().trim().max(max).transform((v) => (v === "" ? null : v)).nullable().optional();

// bcrypt only uses the first 72 bytes, so cap there. Policy: 12+ chars with
// lower, upper, digit and symbol.
export const passwordSchema = z
  .string()
  .min(12, "At least 12 characters")
  .max(72, "At most 72 characters")
  .regex(/[a-z]/, "Add a lowercase letter")
  .regex(/[A-Z]/, "Add an uppercase letter")
  .regex(/[0-9]/, "Add a number")
  .regex(/[^A-Za-z0-9]/, "Add a symbol");

const statusSchema = z.enum(["Active", "Suspended"]);
const usernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(50)
  .regex(/^[a-zA-Z0-9._-]+$/, "Letters, numbers, dot, dash and underscore only");

// ── pagination / list queries ───────────────────────────────

const pageSchema = z.coerce.number().int().min(1).max(10000).default(1);
const limitSchema = z.coerce.number().int().min(1).max(50).default(15);
const searchSchema = z.string().trim().max(100).optional();
const dirSchema = z.enum(["asc", "desc"]).default("desc");

export const listClinicsQuerySchema = z.object({
  q: searchSchema,
  status: statusSchema.optional(),
  page: pageSchema,
  limit: limitSchema,
  sort: z.enum(["createdAt", "name", "status"]).default("createdAt"),
  dir: dirSchema,
});

export const listDoctorsQuerySchema = z.object({
  q: searchSchema,
  status: statusSchema.optional(),
  page: pageSchema,
  limit: limitSchema,
  sort: z.enum(["createdAt", "name", "status"]).default("createdAt"),
  dir: dirSchema,
});

export const listAdminsQuerySchema = z.object({
  q: searchSchema,
  role: z.enum(ADMIN_ROLES).optional(),
  status: statusSchema.optional(),
  page: pageSchema,
  limit: limitSchema,
});

export const listAuditQuerySchema = z.object({
  q: searchSchema,
  action: z.string().trim().max(60).optional(),
  page: pageSchema,
  limit: limitSchema,
});

// ── auth ────────────────────────────────────────────────────

export const adminLoginSchema = z.strictObject({
  username: z.string().trim().min(1).max(50),
  password: z.string().min(1).max(128),
});

export const changeOwnPasswordSchema = z.strictObject({
  currentPassword: z.string().min(1).max(128),
  newPassword: passwordSchema,
});

export const resetPasswordSchema = z.strictObject({ password: passwordSchema });

// ── clinics ─────────────────────────────────────────────────

const clinicFields = {
  name: z.string().trim().min(2).max(120),
  clinicCode: trimmedOrNull(20),
  location: z.string().trim().min(1).max(120),
  country: trimmedOrNull(80),
  province: trimmedOrNull(80),
  city: trimmedOrNull(80),
  isBifurcated: z.boolean(),
  priceVitals: z.number().int().min(0).max(1_000_000),
  priceBloodSugar: z.number().int().min(0).max(1_000_000),
  priceConsultancyGP: z.number().int().min(0).max(1_000_000),
  showPricing: z.boolean(),
  pagesDemographic: z.boolean(),
  pagesVitals: z.boolean(),
  pagesOnlineConsultation: z.boolean(),
  pagesPharmacy: z.boolean(),
};

export const createClinicSchema = z.strictObject({
  username: usernameSchema,
  password: passwordSchema,
  ...clinicFields,
  // everything except name/username/password is optional on create (DB defaults apply)
  location: clinicFields.location.optional(),
  isBifurcated: clinicFields.isBifurcated.optional(),
  priceVitals: clinicFields.priceVitals.optional(),
  priceBloodSugar: clinicFields.priceBloodSugar.optional(),
  priceConsultancyGP: clinicFields.priceConsultancyGP.optional(),
  showPricing: clinicFields.showPricing.optional(),
  pagesDemographic: clinicFields.pagesDemographic.optional(),
  pagesVitals: clinicFields.pagesVitals.optional(),
  pagesOnlineConsultation: clinicFields.pagesOnlineConsultation.optional(),
  pagesPharmacy: clinicFields.pagesPharmacy.optional(),
});

export const updateClinicSchema = z
  .strictObject(clinicFields)
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");

// ── doctors ─────────────────────────────────────────────────

const stringList = z.array(z.string().trim().min(1).max(80)).max(15);

const doctorFields = {
  title: z.string().trim().min(1).max(20),
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  phone: trimmedOrNull(20),
  gender: z.enum(["Male", "Female", "Other"]).nullable().optional(),
  specializations: stringList,
  qualifications: stringList,
  pmdcNumber: trimmedOrNull(40),
  experience: z.number().int().min(0).max(80),
  city: trimmedOrNull(80),
};

export const createDoctorSchema = z.strictObject({
  email: z.string().trim().toLowerCase().email().max(254),
  password: passwordSchema,
  ...doctorFields,
  specializations: doctorFields.specializations.optional(),
  qualifications: doctorFields.qualifications.optional(),
  experience: doctorFields.experience.optional(),
});

export const updateDoctorSchema = z
  .strictObject(doctorFields)
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");

// ── shared ──────────────────────────────────────────────────

export const updateStatusSchema = z.strictObject({ status: statusSchema });

export const assignmentSchema = z.strictObject({
  doctorId: z.string().uuid(),
  clinicId: z.string().uuid(),
});

// ── admins ──────────────────────────────────────────────────

export const createAdminSchema = z.strictObject({
  username: usernameSchema,
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().email().max(254),
  password: passwordSchema,
  role: z.enum(ADMIN_ROLES),
});

export const updateAdminSchema = z
  .strictObject({
    name: z.string().trim().min(2).max(100),
    email: z.string().trim().toLowerCase().email().max(254),
    role: z.enum(ADMIN_ROLES),
    status: statusSchema,
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");

export type AdminLoginInput = z.infer<typeof adminLoginSchema>;
export type ChangeOwnPasswordInput = z.infer<typeof changeOwnPasswordSchema>;
export type ListClinicsQuery = z.infer<typeof listClinicsQuerySchema>;
export type ListDoctorsQuery = z.infer<typeof listDoctorsQuerySchema>;
export type ListAdminsQuery = z.infer<typeof listAdminsQuerySchema>;
export type ListAuditQuery = z.infer<typeof listAuditQuerySchema>;
export type CreateClinicInput = z.infer<typeof createClinicSchema>;
export type UpdateClinicInput = z.infer<typeof updateClinicSchema>;
export type CreateDoctorInput = z.infer<typeof createDoctorSchema>;
export type UpdateDoctorInput = z.infer<typeof updateDoctorSchema>;
export type CreateAdminInput = z.infer<typeof createAdminSchema>;
export type UpdateAdminInput = z.infer<typeof updateAdminSchema>;
export type UpdateStatusInput = z.infer<typeof updateStatusSchema>;
export type AssignmentInput = z.infer<typeof assignmentSchema>;
__CARESYNC_EOF__


# add the seed scripts to package.json
node -e '
const fs = require("fs");
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
pkg.scripts["db:seedSuperAdmin"] = "tsx src/db/seedSuperAdmin.ts";
pkg.scripts["db:seedSuperAdmin:prod"] = "cross-env DEPLOY_TARGET=production tsx src/db/seedSuperAdmin.ts";
fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");
'

echo ""
echo "Backend files written. Remaining manual steps are in the instructions."
