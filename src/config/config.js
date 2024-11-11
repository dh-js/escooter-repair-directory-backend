import dotenv from "dotenv";
dotenv.config();

const requiredEnvVars = ["SUPABASE_URL", "SUPABASE_KEY", "APIFY_API_TOKEN"];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}

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
