import { createClient } from "@supabase/supabase-js";
import config from "../config/config.js";
import logger from "../utils/logger.js";

const filepath = "services/supabaseServicesAI.js";
const supabase = createClient(config.supabase.url, config.supabase.key);

/**
 * Fetches stores that need AI processing
 * @param {number} limit - Maximum number of stores to fetch
 */
export const fetchUnprocessedStoresDb = async (limit = 100) => {
  try {
    const { data, error } = await supabase
      .from("stores")
      .select("*")
      .is("ai_summary", null)
      .limit(limit);

    if (error) {
      logger.error("Error fetching unprocessed stores:", {
        filepath,
        error: error.message,
        code: error.code,
      });
      throw error;
    }

    logger.info(`Fetched ${data.length} unprocessed stores`, {
      filepath,
      limit,
    });

    return data;
  } catch (error) {
    logger.error("Failed to fetch unprocessed stores:", error, { filepath });
    throw error;
  }
};

/**
 * Updates stores with their AI summaries in batches
 */
export const writeAISummariesToDb = async (storeSummaries) => {
  try {
    if (!storeSummaries?.length) {
      throw new Error("No store summaries provided to write");
    }

    // Process summaries in batches
    const BATCH_SIZE = 50;
    const results = {
      successful: [],
      failed: [],
    };

    for (let i = 0; i < storeSummaries.length; i += BATCH_SIZE) {
      const batch = storeSummaries.slice(i, i + BATCH_SIZE);

      const { data, error } = await supabase.from("stores").upsert(
        batch.map(({ place_id, ai_summary }) => ({
          place_id,
          ai_summary,
          ai_summary_updated_at: new Date().toISOString(),
        })),
        {
          onConflict: "place_id",
          returning: true,
        }
      );

      if (error) {
        logger.error(`Batch ${Math.floor(i / BATCH_SIZE) + 1} failed:`, {
          filepath,
          error: error.message,
          failedCount: batch.length,
        });
        results.failed.push(...batch);
        continue;
      }

      if (data) {
        results.successful.push(...data);
      }
    }

    const summary = {
      totalProcessed: storeSummaries.length,
      successful: results.successful.length,
      failed: results.failed.length,
      failedStores: results.failed.map((store) => ({
        place_id: store.place_id,
      })),
    };

    logger.info("AI summary update operation completed", {
      filepath,
      ...summary,
    });

    return summary;
  } catch (error) {
    logger.error("AI summary update operation failed:", {
      filepath,
      error: error.message,
      totalStores: storeSummaries?.length,
    });
    throw error;
  }
};
