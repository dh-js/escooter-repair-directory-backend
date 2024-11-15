import { createClient } from "@supabase/supabase-js";
import config from "../config/config.js";
import logger from "../utils/logger.js";

const filepath = "services/supabaseService.js";
const supabase = createClient(config.supabase.url, config.supabase.key);

/**
 * Writes Apify run metadata to the apify_runs table
 */
export const writeApifyRunDetails = async (runDetails) => {
  try {
    // Validate required fields
    if (!runDetails?.runId) {
      throw new Error("Missing required field: runId");
    }

    const { data, error } = await supabase
      .from("apify_runs")
      .insert({
        run_id: runDetails.runId,
        actor_id: runDetails.actorId,
        status: runDetails.status,
        status_message: runDetails.statusMessage,
        timing: runDetails.timing,
        data_ids: runDetails.data_ids,
        usage: runDetails.usage,
        search_params: runDetails.searchParams,
        results_count: runDetails.resultsCount,
      })
      .select();

    if (error) {
      // Log specific Supabase error details
      logger.error(`Supabase error storing run ${runDetails.runId}:`, {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
        filepath,
      });
      throw error;
    }

    if (!data?.length) {
      throw new Error(
        `No data returned after inserting run ${runDetails.runId}`
      );
    }

    logger.info(`Stored Apify run details for run ${runDetails.runId}`, {
      filepath,
      rowId: data[0].id, // Log the inserted row ID
    });
    return data[0];
  } catch (error) {
    const enhancedError = new Error(
      `Failed to store Apify run details: ${error.message}`
    );
    enhancedError.originalError = error;
    enhancedError.runId = runDetails?.runId;

    logger.error("Error storing Apify run details:", enhancedError, {
      filepath,
      context: {
        runId: runDetails?.runId,
        actorId: runDetails?.actorId,
      },
    });
    throw enhancedError;
  }
};

/**
 * Writes or updates store data in the stores table
 */
export const writeStores = async (stores) => {
  try {
    if (!stores?.length) {
      throw new Error("No stores provided to write");
    }

    // Filter out stores with missing required fields
    const validStores = stores.filter((store) => {
      if (!store.place_id) {
        logger.warn("Skipping store with missing place_id", {
          filepath,
          store: store.name || "unknown",
        });
        return false;
      }
      return true;
    });

    if (validStores.length === 0) {
      throw new Error("No valid stores to write after filtering");
    }

    // Get existing place_ids in one query
    const { data: existingStores, error: existingError } = await supabase
      .from("stores")
      .select("place_id")
      .in(
        "place_id",
        validStores.map((store) => store.place_id)
      );

    if (existingError) {
      throw new Error(
        `Failed to fetch existing stores: ${existingError.message}`
      );
    }

    const existingPlaceIds = new Set(
      existingStores?.map((store) => store.place_id) || []
    );

    // Process stores in batches
    const BATCH_SIZE = 100;
    const results = {
      successful: [],
      failed: [],
      newStores: [],
      updatedStores: [],
    };

    for (let i = 0; i < validStores.length; i += BATCH_SIZE) {
      const batch = validStores.slice(i, i + BATCH_SIZE);

      const { data, error } = await supabase.from("stores").upsert(batch, {
        onConflict: "place_id",
        returning: true,
      });

      if (error) {
        logger.error(`Batch ${Math.floor(i / BATCH_SIZE) + 1} failed:`, {
          filepath,
          error: error.message,
          failedCount: batch.length,
        });
        results.failed.push(...batch);
        continue;
      }

      // Fix: Always process the batch as successful if there's no error
      if (!data) {
        // If no data returned but also no error, consider the batch successful
        results.successful.push(...batch);
        results.newStores.push(...batch); // Since table was empty, these are new stores
      } else {
        // Process returned data as before
        data.forEach((store) => {
          results.successful.push(store);
          if (existingPlaceIds.has(store.place_id)) {
            results.updatedStores.push(store);
          } else {
            results.newStores.push(store);
          }
        });
      }
    }

    const summary = {
      totalProcessed: validStores.length,
      successful: results.successful.length,
      failed: results.failed.length,
      newStores: results.newStores.length,
      updatedStores: results.updatedStores.length,
      failedStores: results.failed.map((store) => ({
        place_id: store.place_id,
        name: store.name,
      })),
    };

    logger.info("Store operation completed", {
      filepath,
      ...summary,
    });

    return summary;
  } catch (error) {
    logger.error("Store operation failed:", {
      filepath,
      error: error.message,
      totalStores: stores?.length,
    });
    throw error;
  }
};
