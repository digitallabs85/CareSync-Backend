import dotenv from "dotenv";

dotenv.config();

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export const DEBUG = true;

// Vercel automatically sets VERCEL_ENV to "production", "preview", or "development"
// on every deployment — it's never set locally, so this reliably distinguishes
// "running on Vercel in production" from "running on my machine"
const isProduction = process.env.VERCEL_ENV === "production" || process.env.DEPLOY_TARGET === "production";

// Shared secret between the admin portal's server (Next.js) and this API.
// The admin API answers 404 to any request that doesn't carry it, so the admin
// endpoints can't be probed or brute-forced directly from the internet.
const adminProxySecret = requireEnv("ADMIN_PROXY_SECRET");
if (adminProxySecret.length < 32) {
  throw new Error("ADMIN_PROXY_SECRET must be at least 32 characters (use: openssl rand -hex 32)");
}

const jwtSecret = requireEnv("JWT_SECRET");
if (jwtSecret.length < 32) {
  console.warn("[env] JWT_SECRET is shorter than 32 characters — rotate it to a longer random value.");
}

export const env = {
  port: parseInt(process.env.PORT || "5000", 10),
  isProduction,
  bcryptSaltRounds: 10,
  adminEmail: requireEnv("ADMIN_EMAIL"),
  adminPassword: requireEnv("ADMIN_PASSWORD"),
  agoraAppId: requireEnv("AGORA_APP_ID"),
  agoraAppCertificate: requireEnv("AGORA_APP_CERTIFICATE"),
  firebaseProjectId: requireEnv("FIREBASE_PROJECT_ID"),
  firebaseClientEmail: requireEnv("FIREBASE_CLIENT_EMAIL"),
  firebasePrivateKey: requireEnv("FIREBASE_PRIVATE_KEY").replace(/\\n/g, "\n"),
  databaseUrl: isProduction
    ? requireEnv("PRODUCTION_DATABASE_URL")
    : requireEnv("DATABASE_URL"),
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  // Admin sessions aredeliberately short-lived (clinic/doctor tokens keep JWT_EXPIRES_IN).
  adminJwtExpiresIn: process.env.ADMIN_JWT_EXPIRES_IN || "8h",
  adminProxySecret,
  clientUrls: isProduction
    ? [process.env.CLINIC_URL!, process.env.DOCTOR_URL!]
    : ["http://localhost:3000", "http://localhost:3001"],
};

console.log("CORS clientUrls:", env.clientUrls)
