import dotenv from "dotenv";
import { createApp } from "./app.js";
import { connectDB } from "./config/db.js";
import { seedDatabaseIfEmpty } from "./utils/seed.js";

dotenv.config();

const port = Number(process.env.API_PORT ?? 4000);
const app = createApp();

async function startServer() {
  const connected = await connectDB();
  if (connected) {
    await seedDatabaseIfEmpty();
  } else if (process.env.REQUIRE_DB === "true") {
    console.error("❌ REQUIRE_DB=true but MongoDB is unavailable. Refusing to start on in-memory demo data.");
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
  });
}

startServer();
