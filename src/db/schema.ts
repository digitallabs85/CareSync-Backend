// src/db/schema.ts
import { pgTable, text, timestamp, uuid, varchar, integer, numeric, boolean, jsonb, uniqueIndex, date } from "drizzle-orm/pg-core";

// ────────────────────────────────────────────────────────────
// ADMIN
// Platform-level admins (not clinic staff, not doctors).
// ────────────────────────────────────────────────────────────
export const admins = pgTable("admins", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: varchar("username", { length: 50 }).notNull().unique(),
  name: text("name"),
  email: text("email"),
  password: text("password").notNull(),
  role: text("role").notNull().default("admin"),
  status: text("status").notNull().default("Active"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
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
});

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
});

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
});

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