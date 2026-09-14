CREATE TABLE "admins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" varchar(50) NOT NULL,
	"name" text,
	"email" text,
	"password" text NOT NULL,
	"role" text DEFAULT 'admin' NOT NULL,
	"status" text DEFAULT 'Active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_admin_id" uuid,
	"created_by_name" text,
	CONSTRAINT "admins_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid NOT NULL,
	"actor_name" text NOT NULL,
	"actor_role" text NOT NULL,
	"action" text NOT NULL,
	"entity_type" text,
	"entity_id" text,
	"entity_name" text,
	"description" text NOT NULL,
	"changes" jsonb,
	"ip_address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vitals_id" uuid NOT NULL,
	"doctor_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"agora_channel_name" text,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"accepted_at" timestamp with time zone,
	"missed_at" timestamp with time zone,
	"patient_ended_at" timestamp with time zone,
	"doctor_ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "clinics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" varchar(50) NOT NULL,
	"password" text NOT NULL,
	"name" text,
	"clinic_code" varchar(20),
	"location" text DEFAULT 'Pilot' NOT NULL,
	"country" text,
	"city" text,
	"province" text,
	"status" text DEFAULT 'Active' NOT NULL,
	"created_by_admin_id" uuid,
	"created_by_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"price_vitals" integer DEFAULT 0 NOT NULL,
	"price_blood_sugar" integer DEFAULT 0 NOT NULL,
	"price_consultancy_gp" integer DEFAULT 0 NOT NULL,
	"show_pricing" boolean DEFAULT false NOT NULL,
	"pages_demographic" boolean DEFAULT true NOT NULL,
	"pages_vitals" boolean DEFAULT true NOT NULL,
	"pages_online_consultation" boolean DEFAULT true NOT NULL,
	"pages_pharmacy" boolean DEFAULT true NOT NULL,
	CONSTRAINT "clinics_username_unique" UNIQUE("username"),
	CONSTRAINT "clinics_clinic_code_unique" UNIQUE("clinic_code")
);
--> statement-breakpoint
CREATE TABLE "daily_token_counters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"date" date NOT NULL,
	"counter" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "doctor_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doctor_id" uuid NOT NULL,
	"action" text DEFAULT 'logout' NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "doctor_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doctor_id" uuid NOT NULL,
	"login_at" timestamp with time zone DEFAULT now() NOT NULL,
	"logout_at" timestamp with time zone,
	"logout_reason" text
);
--> statement-breakpoint
CREATE TABLE "doctors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid,
	"title" varchar(20) NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text NOT NULL,
	"password" text NOT NULL,
	"phone" varchar(20),
	"gender" text,
	"photo" text,
	"specializations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"qualifications" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"pmdc_number" text,
	"experience" integer DEFAULT 0,
	"city" text,
	"doctor_status" text DEFAULT 'offline' NOT NULL,
	"status" text DEFAULT 'Active' NOT NULL,
	"on_call" boolean DEFAULT false NOT NULL,
	"fcm_token" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "doctors_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "patients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"phone_number" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text,
	"age" integer NOT NULL,
	"gender" text NOT NULL,
	"dob" text,
	"country" text,
	"province" text,
	"city" text,
	"st_address" text,
	"languages" text,
	"vitals_recorded" boolean DEFAULT false NOT NULL,
	"fcm_token" text,
	"token" varchar(10),
	"token_date" date,
	"mr_number" text,
	"profile_photo" text,
	"consent_accepted" boolean DEFAULT false NOT NULL,
	"consent_date" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prescription_medicines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prescription_id" uuid NOT NULL,
	"medicine_name" text NOT NULL,
	"morning" boolean DEFAULT false NOT NULL,
	"afternoon" boolean DEFAULT false NOT NULL,
	"night" boolean DEFAULT false NOT NULL,
	"before_meal" boolean DEFAULT false NOT NULL,
	"after_meal" boolean DEFAULT true NOT NULL,
	"dosage" text,
	"duration" text
);
--> statement-breakpoint
CREATE TABLE "prescriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"doctor_id" uuid NOT NULL,
	"vitals_id" uuid,
	"token" varchar(10) NOT NULL,
	"diagnosis" text,
	"hematological_test" text,
	"radiological_test" text,
	"clinical_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "vitals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"pulse_rate" integer,
	"blood_oxygen" integer,
	"systolic" integer,
	"diastolic" integer,
	"temperature" numeric(4, 1),
	"temperature_unit" text DEFAULT 'F',
	"blood_sugar" text DEFAULT 'Not Performed',
	"weight" numeric(5, 2),
	"height" numeric(5, 2),
	"height_unit" text DEFAULT 'cm',
	"bmi" numeric(4, 1),
	"patient_type" text DEFAULT 'Walk-in',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_vitals_id_vitals_id_fk" FOREIGN KEY ("vitals_id") REFERENCES "public"."vitals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_doctor_id_doctors_id_fk" FOREIGN KEY ("doctor_id") REFERENCES "public"."doctors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_token_counters" ADD CONSTRAINT "daily_token_counters_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doctor_logs" ADD CONSTRAINT "doctor_logs_doctor_id_doctors_id_fk" FOREIGN KEY ("doctor_id") REFERENCES "public"."doctors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doctor_sessions" ADD CONSTRAINT "doctor_sessions_doctor_id_doctors_id_fk" FOREIGN KEY ("doctor_id") REFERENCES "public"."doctors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doctors" ADD CONSTRAINT "doctors_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patients" ADD CONSTRAINT "patients_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescription_medicines" ADD CONSTRAINT "prescription_medicines_prescription_id_prescriptions_id_fk" FOREIGN KEY ("prescription_id") REFERENCES "public"."prescriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_doctor_id_doctors_id_fk" FOREIGN KEY ("doctor_id") REFERENCES "public"."doctors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_vitals_id_vitals_id_fk" FOREIGN KEY ("vitals_id") REFERENCES "public"."vitals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vitals" ADD CONSTRAINT "vitals_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "clinic_date_idx" ON "daily_token_counters" USING btree ("clinic_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "token_clinic_date_idx" ON "patients" USING btree ("clinic_id","token","token_date");