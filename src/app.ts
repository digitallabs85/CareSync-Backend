import express, { Request, Response } from "express";
import cors from "cors";
import { env } from "./config/env";
import { db } from "./db";
import { sql } from "drizzle-orm";
import routes from "./routes";
import { errorHandler } from "./middleware/errorHandler.middleware";

const app = express();

app.use(cors({ origin: env.clientUrls, credentials: true }));
app.use(express.json());

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", env: env.isProduction ? "production" : "development" });
});

app.get("/health/db", async (_req: Request, res: Response) => {
  try {
    await db.execute(sql`SELECT 1`);
    res.json({ status: "ok", db: "connected" });
  } catch (err) {
    res.status(500).json({ status: "error", db: "not connected", message: (err as Error).message });
  }
});

app.use("/api", routes);
app.use(errorHandler);

export default app;