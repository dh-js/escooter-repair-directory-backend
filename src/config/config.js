import dotenv from "dotenv";
import logger from "../utils/logger.js";

const filepath = "config/config.js";

dotenv.config();

const requiredEnvVars = ["SUPABASE_URL", "SUPABASE_KEY", "APIFY_API_TOKEN"];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    logger.error(`Missing required environment variable: ${envVar}`, {
      filepath,
    });
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}

logger.info("Configuration loaded successfully", {
  filepath,
  nodeEnv: process.env.NODE_ENV || "development",
  port: process.env.PORT || 3000,
});

export default {
  nodeEnv: process.env.NODE_ENV || "development",
  port: process.env.PORT || 3000,
  apify: {
    apiToken: process.env.APIFY_API_TOKEN,
    searchQueries: [
      "electric scooter repair",
      "stand-up electric scooter",
      "bicycle Repair",
    ],
  },
  supabase: {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_KEY,
  },
};
