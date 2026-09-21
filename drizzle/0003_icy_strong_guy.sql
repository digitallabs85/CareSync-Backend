CREATE TABLE "doctor_clinic_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doctor_id" uuid NOT NULL,
	"clinic_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "doctors" DROP CONSTRAINT "doctors_clinic_id_clinics_id_fk";
--> statement-breakpoint
ALTER TABLE "doctor_clinic_assignments" ADD CONSTRAINT "doctor_clinic_assignments_doctor_id_doctors_id_fk" FOREIGN KEY ("doctor_id") REFERENCES "public"."doctors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doctor_clinic_assignments" ADD CONSTRAINT "doctor_clinic_assignments_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "doctor_clinic_unique_idx" ON "doctor_clinic_assignments" USING btree ("doctor_id","clinic_id");--> statement-breakpoint
ALTER TABLE "doctors" DROP COLUMN "clinic_id";