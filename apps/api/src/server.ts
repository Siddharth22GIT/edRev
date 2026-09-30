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
  }

  app.listen(port, () => {
    console.log(`EduRev API is listening on http://localhost:${port}`);
  });
}

startServer();
