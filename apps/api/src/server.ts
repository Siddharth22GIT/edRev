import dotenv from "dotenv";
import { createApp } from "./app.js";
import { connectDB } from "./config/db.js";
import { demoModeAllowed, productionConfigProblems } from "./config/runtime.js";
import { seedDatabaseIfEmpty } from "./utils/seed.js";
import { scheduleDailyChecks } from "./services/daily-checks.service.js";

dotenv.config();

const port = Number(process.env.API_PORT ?? 4000);
const app = createApp();

async function startServer() {
  // S2: a production server must not start with a missing or guessable token secret
  const problems = productionConfigProblems();
  if (problems.length > 0) {
    console.error(`❌ Refusing to start in production: ${problems.join(" ")}`);
    process.exit(1);
  }

  const connected = await connectDB();
  if (connected) {
    await seedDatabaseIfEmpty();
  } else if (process.env.REQUIRE_DB === "true" || !demoModeAllowed()) {
    // S1: production never runs on demo data (it would accept the shared development password)
    console.error("❌ MongoDB is unavailable and demo data mode is not allowed here (REQUIRE_DB=true or NODE_ENV=production). Refusing to start.");
    process.exit(1);
  } else {
    console.warn("");
    console.warn("============================================================");
    console.warn(" ⚠️  DEMO DATA MODE: MongoDB is not connected.");
    console.warn("    The API is serving in-memory mock data. Changes are NOT");
    console.warn("    persisted and are lost on restart. Set REQUIRE_DB=true to");
    console.warn("    make this a startup error instead.");
    console.warn("============================================================");
    console.warn("");
  }

  app.listen(port, () => {
    console.log(`EduRev API is listening on http://localhost:${port}`);
    // Phase 4 (G12): reminders, missed check-ins, help escalation and stale tier suggestions, every hour
    scheduleDailyChecks();
  });
}

startServer();
