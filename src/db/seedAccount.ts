import bcrypt from "bcryptjs";
import { db } from "./index";
import { admins } from "./schema";
import { env } from "../config/env";

async function seed() {
  const hashed = await bcrypt.hash(env.adminPassword, 10);
  const [admin] = await db.insert(admins).values({
    username: "superadmin",
    password: hashed,
    name: "Super Admin",
    email: env.adminEmail,
    role: "admin",
  }).returning();
  console.log("Admin created:", admin.username);
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});