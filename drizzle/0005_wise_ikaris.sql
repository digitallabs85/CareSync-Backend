CREATE TYPE "public"."catalog_type" AS ENUM('diagnosis', 'hematological', 'radiological');--> statement-breakpoint
CREATE TABLE "catalog_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" "catalog_type" NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "medicines" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "medicines_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_type_name_uniq" ON "catalog_items" USING btree ("type","name");