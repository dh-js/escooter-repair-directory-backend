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
        store_processing_results: runDetails.store_processing_results,
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
  const MAX_RETRIES = 3;
  const BATCH_SIZE = 100;

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

    // Log the first valid store (maintaining original logging)
    // logger.info("First valid store:", {
    //   filepath,
    //   firstStore: validStores[0],
    //   totalValidStores: validStores.length,
    // });

    // Fetch existing stores with retry logic
    let existingStores = [];

    // Get array of place_ids and validate
    const placeIds = validStores.map((store) => store.place_id).filter(Boolean);

    if (!placeIds.length) {
      logger.warn("No valid place_ids to query", { filepath });
      existingStores = [];
    } else {
      // Split place_ids into same size chunks as write operation
      for (let i = 0; i < placeIds.length; i += BATCH_SIZE) {
        const placeIdChunk = placeIds.slice(i, i + BATCH_SIZE);

        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
          try {
            const { data, error } = await supabase
              .from("stores")
              .select("place_id")
              .in("place_id", placeIdChunk);

            if (error) throw error;

            existingStores = [...existingStores, ...(data || [])];
            break;
          } catch (error) {
            logger.warn(
              `Fetch existing stores chunk ${i}-${
                i + BATCH_SIZE
              }: Attempt ${attempt}/${MAX_RETRIES} failed`,
              {
                filepath,
                error: error.message,
                errorDetails: error.details || {},
                chunkSize: placeIdChunk.length,
              }
            );

            if (attempt === MAX_RETRIES) {
              throw new Error(
                `Failed to fetch existing stores chunk: ${error.message}`
              );
            }

            await new Promise((resolve) =>
              setTimeout(resolve, Math.pow(2, attempt) * 1000)
            );
          }
        }
      }
    }

    const existingPlaceIds = new Set(
      existingStores?.map((store) => store.place_id) || []
    );
    const results = {
      successful: [],
      failed: [],
      newStores: [],
      updatedStores: [],
    };

    // Process stores in batches with retry logic
    for (let i = 0; i < validStores.length; i += BATCH_SIZE) {
      const batch = validStores.slice(i, i + BATCH_SIZE);
      const batchNumber = Math.floor(i / BATCH_SIZE) + 1;

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          const { data, error } = await supabase.from("stores").upsert(batch, {
            onConflict: "place_id",
            returning: true,
          });

          if (error) throw error;

          // Process successful batch
          const processedStores = data || batch;
          results.successful.push(...processedStores);
          processedStores.forEach((store) => {
            if (existingPlaceIds.has(store.place_id)) {
              results.updatedStores.push(store);
            } else {
              results.newStores.push(store);
            }
          });

          break;
        } catch (error) {
          logger.warn(
            `Batch ${batchNumber}: Attempt ${attempt}/${MAX_RETRIES} failed`,
            {
              filepath,
              error: error.message,
            }
          );

          if (attempt === MAX_RETRIES) {
            logger.error(`Batch ${batchNumber} failed all retry attempts`, {
              filepath,
              error: error.message,
            });
            results.failed.push(...batch);
            break;
          }

          await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
        }
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
    // Enhanced error logging
    logger.error("Store operation failed:", {
      filepath,
      error: error.message,
      errorStack: error.stack,
      totalStores: stores?.length,
      supabaseUrl: config.supabase.url ? "Configured" : "Missing",
      supabaseKey: config.supabase.key ? "Configured" : "Missing",
    });
    throw error;
  }
};
