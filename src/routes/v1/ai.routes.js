import { Router } from "express";
import logger from "../../utils/logger.js";
import {
  fetchStoresDb,
  writeAISummariesToDb,
} from "../../services/supabaseServicesAI.js";
import { claudeAPICall } from "../../services/claudeAPICall.js";
import { formatStoreDataForAI } from "../../utils/formatStoreDataForAI.js";

const filepath = "routes/v1/ai.routes.js";
const router = Router();

/**
 * Main function to process stores through AI analysis
 * Flow:
 * 1. Fetches stores from database
 * 2. Processes stores in batches to isolate failures & allow partial success
 * 3. For each store in a batch:
 *    - Calls Claude AI API to generate summary
 *    - Tracks success/failure
 * 4. Writes successful batch results to database with retry mechanism
 *
 * @returns {Object} processingDetails - Contains statistics about the processing job
 */

// May want to add a mode for "skipped" stores which are stores that had less than 10 reviews and had "No summary available: insufficient reviews" written to the ai_summary field. If in future the db gets updated and their review count is now >=10 and the ai_summary field is still "No summary available: insufficient reviews" then we can reprocess those stores.
const AI_PROCESSING_MODES = {
  UNPROCESSED: {
    mode: "unprocessed",
    limit: 5, // null = no limit
  },
  SINGLE: {
    mode: "single",
    place_id: "ChIJ6erpi_vPD4gRP_g5TqkqlEk", //ELECTRIC SCOOTER CHICAGO LLC
  },
  ALL: {
    mode: "all",
    limit: 20, //null = no limit
  },
  STATE: {
    mode: "state",
    states: [
      "New York",
      "North Carolina",
      "North Dakota",
      "Ohio",
      "Oklahoma",
      "Oregon",
      "Pennsylvania",
      "Rhode Island",
      "South Carolina",
    ], // Accepts an array of states
    limit: null, // Optional limit
  },
};

// This is just how many are passed to the AI, to set the maxes for the scrape make the adjustments in actorConfig.js
const AI_CONFIG = {
  MAX_REVIEWS: 100,
  MAX_QAS: 100,
};

export async function runAIProcessing() {
  const processingDetails = {
    startedAt: new Date().toISOString(),
    totalStores: 0,
    processedStores: 0,
    failedStores: [],
    skippedStores: [],
  };

  try {
    logger.info("Starting AI processing job...", {
      filepath,
      mode: AI_PROCESSING_MODES.STATE,
    });

    logger.info("Processing stores for states:", {
      filepath,
      states: AI_PROCESSING_MODES.STATE.states,
    });

    // Get paginated store fetcher
    const storeFetcher = await fetchStoresDb(AI_PROCESSING_MODES.STATE);
    let currentBatchIndex = 0;
    let hasMoreStores = true;

    // Process stores in batches
    while (hasMoreStores) {
      const { stores, hasMore } = await storeFetcher.fetchNextBatch(
        currentBatchIndex
      );
      hasMoreStores = hasMore;

      if (!stores?.length) break;

      // Simply add the current batch size to total
      processingDetails.totalStores += stores.length;

      logger.info(`Processing batch of stores`, {
        filepath,
        batchIndex: currentBatchIndex,
        batchSize: stores.length,
        totalProcessed: processingDetails.processedStores,
        totalStores: processingDetails.totalStores,
        progressPercentage:
          (
            (processingDetails.processedStores /
              processingDetails.totalStores) *
            100
          ).toFixed(1) + "%",
      });

      // Format and process current batch
      const formattedStores = stores.map((store) =>
        formatStoreDataForAI(store, {
          maxReviews: AI_CONFIG.MAX_REVIEWS,
          maxQAs: AI_CONFIG.MAX_QAS,
        })
      );

      // Process current batch
      const processedStores = [];

      for (const store of formattedStores) {
        try {
          logger.info(`Processing Store: ${store.name}`, {
            filepath,
            place_id: store.place_id,
            section: "START",
          });

          // Check if store has sufficient reviews
          if (store.reviews_count < 10) {
            processedStores.push({
              place_id: store.place_id,
              ai_summary: {
                summary_text: "No summary available: insufficient reviews",
                token_usage: 0,
              },
            });

            processingDetails.skippedStores.push({
              place_id: store.place_id,
              reason: `Insufficient reviews (${store.reviews_count}/10 required)`,
            });

            logger.info(`Store Processing Skipped`, {
              filepath,
              section: "SKIPPED",
              details: {
                storeId: store.place_id,
                name: store.name,
                reviewCount: store.reviews_count,
                required: 10,
              },
            });

            continue;
          }

          const aiSummary = await claudeAPICall(store);

          if (!aiSummary?.summary_text || !aiSummary?.token_usage) {
            throw new Error("Invalid AI summary structure received");
          }

          processedStores.push({
            place_id: store.place_id,
            ai_summary: aiSummary,
          });

          logger.info(`Store Processing Complete`, {
            filepath,
            section: "SUCCESS",
            details: {
              storeId: store.place_id,
              progress: `${processedStores.length}/${processingDetails.totalStores}`,
              tokenUsage: aiSummary.token_usage,
            },
          });
        } catch (error) {
          processingDetails.failedStores.push({
            place_id: store.place_id,
            error: error.message,
          });

          logger.error(`Store Processing Failed`, {
            filepath,
            section: "ERROR",
            details: {
              storeId: store.place_id,
              error: error.message,
              stack: error.stack,
            },
          });
        }
      }

      // Write batch results to database
      if (processedStores.length > 0) {
        const { successful, failed } = await writeAISummariesToDb(
          processedStores
        );
        processingDetails.processedStores += successful.length;
        processingDetails.failedStores.push(...failed);
      }

      currentBatchIndex += storeFetcher.batchSize;

      // Force garbage collection between batches (if available)
      if (global.gc) {
        global.gc();
      }
    }

    processingDetails.finishedAt = new Date().toISOString();

    // Add final summary logging
    const successRate = (
      (processingDetails.processedStores / processingDetails.totalStores) *
      100
    ).toFixed(1);
    const durationSeconds = (
      (new Date(processingDetails.finishedAt) -
        new Date(processingDetails.startedAt)) /
      1000
    ).toFixed(1);

    logger.info(`AI Processing Complete`, {
      filepath,
      summary: {
        successful: processingDetails.processedStores,
        failed: processingDetails.failedStores.length,
        skipped: processingDetails.skippedStores.length,
        total: processingDetails.totalStores,
        duration: `${durationSeconds}s`,
        successRate: `${successRate}%`,
      },
      failedStores: processingDetails.failedStores.map((store) => ({
        id: store.place_id,
        error: store.error,
      })),
    });

    return processingDetails;
  } catch (error) {
    // Handle catastrophic failures that occur outside the batch processing loop
    const enhancedError = new Error(
      `AI processing job failed: ${error.message}`
    );
    enhancedError.originalError = error;

    logger.error("AI processing job failed:", {
      filepath,
      error: enhancedError,
      stack: error.stack,
      context: {
        startedAt: processingDetails.startedAt,
        processedCount: processingDetails.processedCount,
        totalStores: processingDetails.totalStores,
      },
    });

    throw enhancedError;
  }
}

/**
 * Express route handler for triggering AI processing
 * Uses fire-and-forget pattern:
 * 1. Immediately responds to client
 * 2. Continues processing in background
 * 3. Logs any errors that occur during processing
 */
router.post("/process", async (req, res, next) => {
  try {
    logger.info("Triggering new AI processing job...", { filepath });

    // COMMENT OUT THE IMMEDIATE RESPONSE FOR TESTING
    res.json({
      success: true,
      message: "AI processing job triggered successfully",
      startedAt: new Date().toISOString(),
    });

    // Continue processing in background
    await runAIProcessing();
  } catch (error) {
    logger.error("AI processing job failed:", error, { filepath });
    // Error is only logged since response has already been sent
  }
});

export default router;
