CREATE TABLE "global_counters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(50) NOT NULL,
	"counter" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "global_counters_name_unique" UNIQUE("name")
);
