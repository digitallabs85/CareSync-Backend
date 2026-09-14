import app from "./app";
import { env } from "./config/env";

app.listen(env.port, () => {
  console.log(`Server running on http://localhost:${env.port}`);
  console.log(`Environment: ${env.isProduction ? "production" : "development"}`);
});