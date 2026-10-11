CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE TABLE "rate_limits" (
	"key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "rate_limits_key_window_start_pk" PRIMARY KEY("key","window_start")
);
--> statement-breakpoint
ALTER TABLE "admins" ADD COLUMN "token_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "admins" ADD COLUMN "last_login_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "admins" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX "rate_limits_window_idx" ON "rate_limits" USING btree ("window_start");--> statement-breakpoint
CREATE INDEX "audit_created_at_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_action_created_idx" ON "audit_logs" USING btree ("action","created_at");--> statement-breakpoint
CREATE INDEX "audit_description_trgm_idx" ON "audit_logs" USING gin ("description" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "clinics_name_trgm_idx" ON "clinics" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "clinics_username_trgm_idx" ON "clinics" USING gin ("username" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "clinics_city_trgm_idx" ON "clinics" USING gin ("city" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "clinics_code_trgm_idx" ON "clinics" USING gin ("clinic_code" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "clinics_status_idx" ON "clinics" USING btree ("status");--> statement-breakpoint
CREATE INDEX "clinics_created_at_idx" ON "clinics" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "doctor_clinic_clinic_idx" ON "doctor_clinic_assignments" USING btree ("clinic_id");--> statement-breakpoint
CREATE INDEX "doctors_fullname_trgm_idx" ON "doctors" USING gin (("first_name" || ' ' || "last_name") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "doctors_email_trgm_idx" ON "doctors" USING gin ("email" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "doctors_city_trgm_idx" ON "doctors" USING gin ("city" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "doctors_pmdc_trgm_idx" ON "doctors" USING gin ("pmdc_number" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "doctors_status_idx" ON "doctors" USING btree ("status");--> statement-breakpoint
CREATE INDEX "doctors_created_at_idx" ON "doctors" USING btree ("created_at");