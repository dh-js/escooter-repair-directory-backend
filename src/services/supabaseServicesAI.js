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
 * @param {string} [options.state=null] - Specific state ID (required for 'state' mode)
 * @param {number|null} [options.limit=null] - Maximum number of stores to fetch
 *   - null means no limit will be applied
 *   - Ignored in 'single' mode
 * @returns {Promise<Array>} Array of store objects with their details
 */
export const fetchStoresDb = async ({
  mode = "unprocessed",
  place_id = null,
  state = null,
  limit = null,
} = {}) => {
  try {
    // Input validation section
    // Ensure mode is one of the allowed values
    if (!["unprocessed", "single", "all", "state"].includes(mode)) {
      throw new Error(`Invalid mode: ${mode}`);
    }

    // For single store fetch, place_id is mandatory
    if (mode === "single" && !place_id) {
      throw new Error("place_id is required when mode is 'single'");
    }

    // For state mode, state is mandatory
    if (mode === "state" && !state) {
      throw new Error("state is required when mode is 'state'");
    }

    // If limit is provided, ensure it's a valid positive integer
    if (limit !== null && (limit <= 0 || !Number.isInteger(limit))) {
      throw new Error("limit must be a positive integer or null");
    }

    // Build the base query
    // Select specific columns needed for AI processing
    let query = supabase
      .from("stores")
      .select(
        "place_id, name, subtitle, description, categories, total_score, reviews, questions_and_answers, reviews_count"
      );

    // Apply mode-specific filters
    switch (mode) {
      case "unprocessed":
        // Get only stores that haven't been processed by AI yet
        query = query.is("ai_summary", null);
        break;
      case "single":
        // Get specific store by place_id
        query = query.eq("place_id", place_id);
        break;
      case "state":
        query = query.eq("state", state);
        break;
      case "all":
        // No additional filters needed for 'all' mode
        break;
    }

    // Apply limit if provided and not in single mode
    // Single mode always returns one record, so limit is unnecessary
    if (limit !== null && mode !== "single") {
      query = query.limit(limit);
    }

    // Execute the query
    const { data, error } = await query;

    // Error handling for database operation failures
    if (error) {
      const enhancedError = new Error(
        `Failed to fetch stores: ${error.message}`
      );
      enhancedError.originalError = error;
      throw enhancedError;
    }

    // Ensure we received data from the database
    if (!data) {
      throw new Error("No data returned from database");
    }

    // Log successful operation with relevant details
    logger.info(`Fetched stores successfully`, {
      filepath,
      mode,
      count: data.length,
      place_id: mode === "single" ? place_id : undefined, // Only include place_id for single mode
      limit: mode !== "single" ? limit : undefined, // Only include limit for non-single modes
      firstStore: data[0]?.place_id, // Log first store ID for debugging
    });

    return data;
  } catch (error) {
    // Comprehensive error logging for debugging
    logger.error("Failed to fetch stores:", {
      filepath,
      mode,
      place_id: mode === "single" ? place_id : undefined,
      error: error.message,
      stack: error.stack,
    });
    // Re-throw error for handling by caller
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
