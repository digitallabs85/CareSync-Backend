import { defineConfig } from "drizzle-kit";
import dotenv from "dotenv";

dotenv.config();

const isProduction = process.env.DEPLOY_TARGET === "production";

const databaseUrl = isProduction
  ? process.env.PRODUCTION_DATABASE_URL
  : process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    `Missing ${isProduction ? "PRODUCTION_DATABASE_URL" : "DATABASE_URL"} in .env`
  );
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: databaseUrl },
});