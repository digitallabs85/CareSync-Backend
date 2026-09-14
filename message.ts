// src/db/schema.ts 
import { pgTable, text, timestamp, uuid, varchar, integer, date, time, boolean, jsonb } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { serial } from "drizzle-orm/pg-core";

//admin portal

export const admins = pgTable('admins', {
  id: uuid("id").primaryKey().defaultRandom(),
  username: varchar("username", { length: 50 }).notNull().unique(),
  name: text("name").notNull().default("null"),
  email: text("email").notNull().default("null"),
  password: text('password').notNull(),
  role: text("role").notNull().default("admin"),
  status: text("status").notNull().default("Active"), // 'Active' | 'Suspended'
  createdAt: timestamp('created_at').defaultNow().notNull(),
  createdByAdminId: uuid("created_by_admin_id"),
  createdByName: text("created_by_name"),
});
//admin audit
export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  actorId: uuid('actor_id').notNull(),
  actorName: text('actor_name').notNull(),
  actorRole: text('actor_role').notNull(),
  action: text('action').notNull(),
  entityType: text('entity_type'),
  entityId: text('entity_id'),
  entityName: text('entity_name'),
  description: text('description').notNull(),
  changes: jsonb('changes'),
  ipAddress: text('ip_address'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});


// staff/users/clinic
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: varchar("username", { length: 50 }).notNull().unique(),
  password: text("password").notNull(),
  location: text("location").notNull().default("Pilot"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  name: text("name").notNull().default("null"),
  country: text("country").notNull().default("null"),
  city: text("city").notNull().default("null"),
  province: text("province").notNull().default("null"),
  status: text("status").notNull().default("Active"),
  createdByAdminId: uuid("created_by_admin_id"),
  createdByName: text("created_by_name"),
  clinicId: varchar("clinic_id", { length: 20 }).unique(),
});

export const all_entries = pgTable("all_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  phoneNumber: text("phoneNumber").notNull(),
  firstName: text("firstName").notNull(),
  lastName: text("lastName").notNull().default("null"),
  father_husband: text("father_husband").notNull().default("null"),
  age: integer("age").notNull(),
  gender: text("gender").notNull(),
  createdDate: date("created_date"),
  createdTime: time("created_time"),
  user_id: uuid("user_id").notNull().references(() => users.id),
  email: text("email").default("null"),
  cnic: text("cnic").default("null"),
  dob: text("dob").notNull().default("null"),
  country: text("country").notNull().default("null"),
  province: text("province").notNull().default("null"),
  city: text("city").notNull().default("null"),
  stAddress: text("stAddress").notNull().default("null"),
  languages: text("languages").default("null"),
  surgicalHistory: text("surgicalHistory").default("null"),
  medicalHistory: text("medicalHistory").default("null"),
  medicineHistory: text("medicineHistory").default("null"),
  allergies: text("allergies").default("null"),
  vitalsRecorded: boolean("vitals_recorded").default(false).notNull(),
  fcmToken: text("fcm_token"),
  token: varchar("token", { length: 10 }),
  tokenDate: date("token_date"),           // date of latest check-in
  tokenTime: time("token_time"),            // time of last check-in
  mrNumber: text("mrNumber"),
  profilePhoto: text("profilePhoto").default("null"),
  countryCode: text("countryCode").default("null"),
  consentAccepted: boolean("consentAccepted").default(false).notNull(),
  consentDate: timestamp("consentDate", { withTimezone: true }),
});

export const vitals = pgTable("vitals", {
  id: uuid("id").primaryKey().defaultRandom(),
  PulseRate: text("PulseRate"),
  BloodOxygen: text("BloodOxygen"),
  Diastolic: text("Diastolic"),
  Systolic: text("Systolic"),
  Temperature: text("Temperature"),
  temperatureUnit: text("temperatureUnit"),
  Weight: text("Weight"),
  Height: text("Height"),
  heightUnit: text("heightUnit"),
  symptoms: text("symptoms"),
  bmi: text("bmi"),

  token: varchar("token", { length: 10 }),
  patientType: text("patientType").default("Walk-in"),

  createdDate: date("created_date"),
  createdTime: time("created_time"),

  // Video call fields
  roomUrl: text("room_url"),
  roomName: text("room_name"),
  callStatus: text("call_status").default("idle"),
  calledDoctorId: uuid("called_doctor_id").references(() => doctors.id),

  patient_id: uuid("patient_id").notNull().references(() => all_entries.id),
});

//Rapid Testing
export const rapid_testing = pgTable("rapid_testing", {
  id: uuid("id").primaryKey().defaultRandom(),
  bloodSugar: text("blood_sugar").default("Not Performed"),
  ecg: text("ecg").default("Not Performed"),
  ecgLink: text("ecgLink").default("Not Performed"),
  hiv: text("hiv").default("Not Performed"),
  hepatitis: text("hepatitis").default("Not Performed"),
  hbsag: text("hbsag").default("Not Performed"),
  hcvAb: text("hcv_ab").default("Not Performed"),
  hivAb: text("hiv_ab").default("Not Performed"),
  dengueNs1Ag: text("dengue_ns1_ag").default("Not Performed"),
  syphilisAb: text("syphilis_ab").default("Not Performed"),
  typhoidAb: text("typhoid_ab").default("Not Performed"),
  tuberculosis: text("tuberculosis").default("Not Performed"),
  malariaPfPvAg: text("malaria_pf_pv_ag").default("Not Performed"),
  hemoglobin: text("hemoglobin").default("Not Performed"),
  cholesterol: text("cholesterol").default("Not Performed"),
  bodyFat: text("body_fat").default("Not Performed"),
  createdDate: date("created_date"),
  createdTime: time("created_time"),
  vitals_id: uuid("vitals_id").notNull().references(() => vitals.id,),
});
//eyetesting
export const eye_testing = pgTable("eye_testing", {
  id: uuid("id").primaryKey().defaultRandom(),

  chartType: text("chart_type").notNull().default("Not Performed"),
  leftEye: text("left_eye").notNull().default("Not Performed"),
  rightEye: text("right_eye").notNull().default("Not Performed"),
  leftEyeResult: text("leftEyeResult").notNull().default("Not Performed"),
  rightEyeResult: text("rightEyeResult").notNull().default("Not Performed"),
  createdDate: date("created_date"),
  createdTime: time("created_time"),

  vitals_id: uuid("vitals_id").notNull().references(() => vitals.id),
});

//color blind testing
export const color_blind_testing = pgTable("color_blind_testing", {
  id: uuid("id").primaryKey().defaultRandom(),

  plate1: text("plate_1").notNull().default("Not Performed"),
  plate2: text("plate_2").notNull().default("Not Performed"),
  plate3: text("plate_3").notNull().default("Not Performed"),
  colorBlindResult: text("color_blind_result").notNull().default("Not Performed"),

  createdDate: date("created_date"),
  createdTime: time("created_time"),

  vitals_id: uuid("vitals_id").notNull().references(() => vitals.id),
});

// Hearing Testing Table
export const hearing_testing = pgTable("hearing_testing", {
  id: uuid("id").primaryKey().defaultRandom(),

  leftEar: text("left_ear").notNull().default("Not Performed"),
  rightEar: text("right_ear").notNull().default("Not Performed"),
  leftEarResult: text("left_ear_result").notNull().default("Not Performed"),
  rightEarResult: text("right_ear_result").notNull().default("Not Performed"),

  createdDate: date("created_date"),
  createdTime: time("created_time"),

  vitals_id: uuid("vitals_id").notNull().references(() => vitals.id),
});

// ─────────────────────────────────────────────
// 4. DOCTORS
// ─────────────────────────────────────────────
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
  doctorStatus: text("doctorStatus").default("offline"),
  status: text("status").notNull().default("Active"), // 'Active' | 'Suspended'
  onCall: boolean("on_call").default(false).notNull(), // true while doctor is actively in a video consultation
  user_id: uuid("user_id").references(() => users.id),

  createdDate: date("created_date").defaultNow().notNull(),
  createdTime: time("created_time").defaultNow(),
  updatedDate: date("updated_date").defaultNow().notNull(),
  updatedTime: time("updated_time").defaultNow(),

  fcmToken: text("fcm_token"),
});

export const doctor_sessions = pgTable("doctor_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  doctor_id: uuid("doctor_id").notNull().references(() => doctors.id, { onDelete: "cascade" }),
  loginAt: timestamp("login_at", { withTimezone: true }).defaultNow().notNull(),
  logoutAt: timestamp("logout_at", { withTimezone: true }),
  logoutReason: text("logout_reason"),
});

// ─────────────────────────────────────────────
// 4. CALLS
// ─────────────────────────────────────────────
export const calls = pgTable("calls", {
  id: uuid("id").primaryKey().defaultRandom(),
  vitals_id: uuid("vitals_id").notNull().references(() => vitals.id),
  doctor_id: uuid("doctor_id").notNull().references(() => doctors.id),
  status: text("status").default("pending"), // pending, accepted, missed, declined_by_doctor, completed
  createdDate: date("created_date"),   // call REQUEST date
  createdTime: time("created_time"),   // call REQUEST time

  acceptedAt: timestamp("accepted_at", { withTimezone: true }),             // doctor accepted
  missedAt: timestamp("missed_at", { withTimezone: true }),                 // patient cancelled pre-accept OR doctor timed out
  patientEndedAt: timestamp("patient_ended_at", { withTimezone: true }),    // patient hung up
  doctorEndedAt: timestamp("doctor_ended_at", { withTimezone: true }),      // doctor hung up
  callRequestTime: timestamp("call_request_time", { withTimezone: true }),  //call request time
});

// ─────────────────────────────────────────────
// 5. PRESCRIPTIONS (Header)
// ─────────────────────────────────────────────
export const prescriptions = pgTable("prescriptions", {
  id: uuid("id").primaryKey().defaultRandom(),

  patient_id: uuid("patient_id").notNull().references(() => all_entries.id, { onDelete: "cascade" }),
  doctor_id: uuid("doctor_id").notNull().references(() => doctors.id, { onDelete: "cascade" }),
  vitals_id: uuid("vitals_id").references(() => vitals.id),
  token: varchar("token", { length: 10 }).notNull(),

  prescriptionDate: date("prescription_date").defaultNow().notNull(),
  prescriptionTime: time("prescription_time").defaultNow(),

  diagnosis: text("diagnosis"),
  hematologicalTest: text("hematologicalTest"),
  radiologicalTest: text("radiologicalTest"),
  clinicalNotes: text("clinical_notes"),

  updatedAt: timestamp("updated_at", { withTimezone: true }), // null until doctor edits
});

// ─────────────────────────────────────────────
// 6. PRESCRIPTION MEDICINES (One row per medicine)
// ─────────────────────────────────────────────
export const prescription_medicines = pgTable("prescription_medicines", {
  id: uuid("id").primaryKey().defaultRandom(),

  prescription_id: uuid("prescription_id").notNull().references(() => prescriptions.id, { onDelete: "cascade" }),

  medicineName: text("medicine_name").notNull(),

  morning: boolean("morning").default(false).notNull(),     // 1 = true, 0 = false
  afternoon: boolean("afternoon").default(false).notNull(),
  night: boolean("night").default(false).notNull(),

  beforeMeal: boolean("before_meal").default(false).notNull(),
  afterMeal: boolean("after_meal").default(true).notNull(),   // default after meal as common

  dosage: text("dosage"),      // e.g. "500mg", "1 tablet"
  duration: text("duration"),  // e.g. "3 days", "1 week"
});

// ─────────────────────────────────────────────
// 7. DOCTOR ACTIVITY LOGS (Logout Reasons)
// ─────────────────────────────────────────────
export const doctor_logs = pgTable("doctor_logs", {
  id: uuid("id").primaryKey().defaultRandom(),

  doctor_id: uuid("doctor_id").notNull().references(() => doctors.id, { onDelete: "cascade" }),

  action: text("action").notNull().default("logout"),
  reason: text("reason").notNull(),                    // e.g. "Meal Break", "Shift Ends"

  createdDate: date("created_date").defaultNow().notNull(),
  createdTime: time("created_time").defaultNow(),
});

export const medicine_inventry = pgTable("medicines_inventry", {
  id: serial("id").primaryKey(),
  name: text("name"),
  row: integer("row").notNull().default(1),
  column: integer("column").notNull().default(1),
  quantity: integer("quantity").notNull().default(1),
  createdDate: date("created_date").defaultNow().notNull(),
  createdTime: time("created_time").defaultNow(),
})
// ─────────────────────────────────────────────
// 8. DOCTOR SCHEDULES (weekly recurring availability)
// ─────────────────────────────────────────────
export const doctor_schedules = pgTable("doctor_schedules", {
  id: uuid("id").primaryKey().defaultRandom(),
  doctor_id: uuid("doctor_id").notNull().references(() => doctors.id, { onDelete: "cascade" }),
  dayOfWeek: integer("day_of_week").notNull(), // 1=Monday ... 7=Sunday
  startTime: time("start_time").notNull(),
  endTime: time("end_time").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdDate: date("created_date").defaultNow().notNull(),
  createdTime: time("created_time").defaultNow(),
});

export const pricing = pgTable("pricing", {
  id: uuid("id").primaryKey().defaultRandom(),
  vitals: integer("vitals").notNull().default(0),
  bloodSugar: integer("bloodSugar").notNull().default(0),
  ecg: integer("ecg").notNull().default(0),
  hiv: integer("hiv").notNull().default(0),
  hepatitis: integer("hepatitis").notNull().default(0),
  hbsag: integer("hbsag").notNull().default(0),
  hcvAb: integer("hcvAb").notNull().default(0),
  hivAb: integer("hivAb").notNull().default(0),
  dengueNs1Ag: integer("dengueNs1Ag").notNull().default(0),
  syphilisAb: integer("syphilisAb").notNull().default(0),
  typhoidAb: integer("typhoidAb").notNull().default(0),
  tuberculosis: integer("tuberculosis").notNull().default(0),
  malariaPfPvAg: integer("malariaPfPvAg").notNull().default(0),
  hemoglobin: integer("hemoglobin").notNull().default(0),
  cholesterol: integer("cholesterol").notNull().default(0),
  bodyFat: integer("bodyFat").notNull().default(0),
  consultancyGP: integer("consultancyGP").notNull().default(0),
  consultancyConsultant: integer("consultancyConsultant").notNull().default(0),
  isShow: boolean("isShow").notNull().default(false),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
});

// ─────────────────────────────────────────────
// PAGE PERMISSIONS (per-clinic page visibility toggle)
// ─────────────────────────────────────────────
export const page_permissions = pgTable("page_permissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  demographic: boolean("demographic").notNull().default(true),
  vitals: boolean("vitals").notNull().default(true),
  rapidTesting: boolean("rapid_testing").notNull().default(false),
  eyeTesting: boolean("eye_testing").notNull().default(false),
  colorBlindTesting: boolean("color_blind_testing").notNull().default(false),
  hearingTesting: boolean("hearing_testing").notNull().default(false),
  onlineConsultation: boolean("online_consultation").notNull().default(true),
  pharmacy: boolean("pharmacy").notNull().default(true),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
});