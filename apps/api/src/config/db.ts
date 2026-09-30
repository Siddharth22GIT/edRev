import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

let isConnected = false;

export async function connectDB(): Promise<boolean> {
  const uri = process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017/edurev";
  
  if (!uri) {
    console.warn("⚠️ MONGODB_URI is not set. Database connection skipped.");
    return false;
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
