import { createClient } from "@supabase/supabase-js";
import config from "../config/config.js";
import logger from "../utils/logger.js";

const filepath = "services/supabaseServicesAI.js";
const supabase = createClient(config.supabase.url, config.supabase.key);

/**
 * Fetches store data from Supabase database based on specified criteria
 *
 * @param {Object} options - Configuration options for the fetch operation
 * @param {string} [options.mode='unprocessed'] - Fetch mode:
 *   - 'unprocessed': Stores without AI summaries
 *   - 'single': Specific store by place_id
 *   - 'all': All stores in the database
 *   - 'state': Stores in a specific state
 * @param {string} [options.place_id=null] - Specific store ID (required for 'single' mode)
 * @param {string} [options.states=null] - Array of state IDs (required for 'state' mode)
 * @param {number|null} [options.limit=null] - Maximum number of stores to fetch
 *   - null means no limit will be applied
 *   - Ignored in 'single' mode
 * @returns {Promise<Array>} Array of store objects with their details
 */
export const fetchStoresDb = async ({
  mode = "unprocessed",
  place_id = null,
  states = null,
  limit = null,
} = {}) => {
  try {
    // Input validation section
    if (!["unprocessed", "single", "all", "state"].includes(mode)) {
      throw new Error(`Invalid mode: ${mode}`);
    }
    if (mode === "single" && !place_id) {
      throw new Error("place_id is required when mode is 'single'");
    }
    if (mode === "state" && !states) {
      throw new Error("states array is required when mode is 'state'");
    }
    if (limit !== null && (limit <= 0 || !Number.isInteger(limit))) {
      throw new Error("limit must be a positive integer or null");
    }

    const BATCH_SIZE = 50;

    let query = supabase
      .from("stores")
      .select(
        "place_id, name, subtitle, description, categories, total_score, reviews, questions_and_answers, reviews_count"
      );

    // Apply mode-specific filters
    switch (mode) {
      case "unprocessed":
        query = query.is("ai_summary", null);
        break;
      case "single":
        query = query.eq("place_id", place_id);
        break;
      case "state":
        query = query.in("state", states).is("ai_summary", null);
        break;
    }

    return {
      fetchNextBatch: async (startIndex) => {
        logger.info(`Fetching batch of stores`, {
          filepath,
          startIndex,
          batchSize: BATCH_SIZE,
          mode,
          state: mode === "state" ? states.join(", ") : undefined,
        });

        const paginatedQuery = query
          .range(startIndex, startIndex + BATCH_SIZE - 1)
          .limit(limit ? Math.min(BATCH_SIZE, limit - startIndex) : BATCH_SIZE);

        const { data, error } = await paginatedQuery;

        if (error) throw error;

        const hasMore =
          data?.length === BATCH_SIZE &&
          (!limit || startIndex + BATCH_SIZE < limit);

        logger.info(`Batch fetch complete`, {
          filepath,
          storesReturned: data?.length || 0,
          hasMore,
        });

        return { stores: data || [], hasMore };
      },
      batchSize: BATCH_SIZE,
    };
  } catch (error) {
    logger.error("Failed to fetch stores:", {
      filepath,
      mode,
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
};

/**
 * Updates stores with their AI summaries
 */
export const writeAISummariesToDb = async (storeSummaries) => {
  const successful = [];
  const failed = [];

  // Split stores into batches
  for (let i = 0; i < storeSummaries.length; i += 50) {
    const batch = storeSummaries.slice(i, i + 50);
    let retryCount = 0;
    let batchSuccess = false;

    // Attempt to process this batch with retries
    while (retryCount < 3 && !batchSuccess) {
      try {
        if (retryCount > 0) {
          const retryDelay = 1000 * Math.pow(2, retryCount - 1);
          await new Promise((resolve) => setTimeout(resolve, retryDelay));
        }

        // Process each store in the batch
        for (const store of batch) {
          const { data, error } = await supabase
            .from("stores")
            .update({
              ai_summary: store.ai_summary,
              ai_summary_updated_at: new Date().toISOString(),
            })
            .eq("place_id", store.place_id);

          if (error) throw error;

          successful.push(store);
        }

        batchSuccess = true;

        logger.info(`Batch update successful`, {
          filepath,
          batchSize: batch.length,
          totalSuccessful: successful.length,
          progress: `${i + batch.length}/${storeSummaries.length}`,
        });
      } catch (error) {
        retryCount++;

        if (retryCount === 3) {
          logger.error(`Batch update failed after all retries`, {
            filepath,
            error: error.message,
            batchSize: batch.length,
            startIndex: i,
          });

          failed.push(
            ...batch.map((store) => ({
              place_id: store.place_id,
              error: error.message,
            }))
          );
        }
      }
    }
  }

  return { successful, failed };
};
