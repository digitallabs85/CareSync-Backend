// Creates the first super admin, or promotes/resets an existing admin.
//
//   SUPER_ADMIN_USERNAME=owner SUPER_ADMIN_PASSWORD='Str0ng!Passphrase#2026' npm run db:seedSuperAdmin
//   (production: npm run db:seedSuperAdmin:prod with the same variables)

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
