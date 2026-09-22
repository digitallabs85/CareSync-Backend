// import bcrypt from "bcryptjs";
// import { db } from "./index";
// import { admins } from "./schema";
// import { env } from "../config/env";

// async function seed() {
//   const hashed = await bcrypt.hash(env.adminPassword, 10);
//   const [admin] = await db.insert(admins).values({
//     username: "superadmin",
//     password: hashed,
//     name: "Super Admin",
//     email: env.adminEmail,
//     role: "admin",
//   }).returning();
//   console.log("Admin created:", admin.username);
//   process.exit(0);
// }

// seed().catch((err) => {
//   console.error(err);
//   process.exit(1);
// });


// import bcrypt from "bcryptjs";
// import { db } from "./index";
// import { doctors, doctorClinicAssignments } from "./schema";

// const CLINIC_ID = "c59fb599-ae46-47cc-b2c0-1ed2d13955fa"; // testclinic1

// async function seedDoctor() {
//   const hashed = await bcrypt.hash("doctor123", 10);
//   const [doctor] = await db.insert(doctors).values({
//     title: "Dr.",
//     firstName: "Demo",
//     lastName: "Ashar",
//     password: hashed,
//     email: "demo@gmail.com",
//   }).returning();

//   await db.insert(doctorClinicAssignments).values({
//     doctorId: doctor.id,
//     clinicId: CLINIC_ID,
//   });

//   console.log("Doctor created and assigned to clinic:", doctor.firstName);
//   process.exit(0);
// }

// seedDoctor().catch((err) => {
//   console.error(err);
//   process.exit(1);
// });


import bcrypt from "bcryptjs";
import { db } from "./index";
import { clinics } from "./schema";

async function seedClinic() {
  const hashed = await bcrypt.hash("clinic123", 10);
  const [clinic] = await db.insert(clinics).values({
    username: "testclinic2",
    password: hashed,
    name: "Test Clinic 2",
    clinicCode: "TC002",
    location: "Pilot",
    country: "Pakistan",
    city: "Hyderabad",
    province: "Sindh",
  }).returning();

  console.log("Clinic created:", clinic.username, clinic.id);
  process.exit(0);
}

seedClinic().catch((err) => {
  console.error(err);
  process.exit(1);
});