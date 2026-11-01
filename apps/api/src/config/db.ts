import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

let isConnected = false;

const DEV_FALLBACK_URI = "mongodb://127.0.0.1:27017/edurev";

export async function connectDB(): Promise<boolean> {
  const explicitUri = process.env.MONGODB_URI;
  const isProduction = process.env.NODE_ENV === "production";

  if (!explicitUri && isProduction) {
    // MONGODB_URI must be set explicitly in production — never silently use a local fallback
    console.error("❌ FATAL: MONGODB_URI environment variable is not set in production. Refusing to start without a configured database.");
    process.exit(1);
  }

  const uri = explicitUri ?? DEV_FALLBACK_URI;

  if (!explicitUri) {
    console.warn("⚠️ MONGODB_URI is not set. Using local development fallback (" + DEV_FALLBACK_URI + "). Set MONGODB_URI for production.");
  }

  try {
    mongoose.set("strictQuery", false);
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 3000,
    });
    isConnected = true;
    console.log("✅ MongoDB connected successfully to", uri.replace(/\/\/[^:]+:[^@]+@/, "//***:***@"));
    return true;
  } catch (error) {
    console.warn("⚠️ Could not connect to MongoDB:", (error as Error).message);
    console.warn("   Falling back to standard mode. Ensure local MongoDB or MONGODB_URI is available for full database persistence.");
    isConnected = false;
    return false;
  }
}

export function isDbConnected(): boolean {
  return isConnected && mongoose.connection.readyState === 1;
}
