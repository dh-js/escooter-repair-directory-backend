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
    states: ["Nebraska", "Nevada", "New Hampshire", "New Jersey", "New Mexico"], // Now accepts an array of states
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
    failedStores: [],
    skippedStores: [],
  };

  try {
    logger.info("Starting AI processing job...", {
      filepath,
      mode: AI_PROCESSING_MODES.STATE,
      rateLimits: {
        requestsPerMinute: 50,
        tokensPerMinute: 40000,
      },
    });

    // Get stores based on the desired mode:
    const fetchedStores = await fetchStoresDb(AI_PROCESSING_MODES.STATE);

    /**
     * Format each store into an object containing AI-ready text and metadata
     * Example formattedStores array:
     * [
     *   {
     *     place_id: "abc123",
     *     storeTextForAI: "=== STORE INFORMATION ===\nName: Store Name\n..." // Formatted text containing store details, reviews, Q&As
     *     ai_summary: null  // Placeholder for AI-generated summary
     *   },
     * ]
     *
     */
    const formattedStores = fetchedStores.map((store) =>
      formatStoreDataForAI(store, {
        maxReviews: AI_CONFIG.MAX_REVIEWS,
        maxQAs: AI_CONFIG.MAX_QAS,
      })
    );

    logger.info("Number of fetched stores:", {
      filepath,
      totalFetched: fetchedStores.length,
    });

    // Clear fetchedStores as no longer needed
    fetchedStores.length = 0;

    // Validation for formatted stores
    if (!formattedStores?.length) {
      throw new Error("Store formatting failed");
    }

    logger.info("Number of formatted stores:", {
      filepath,
      totalFormatted: formattedStores.length,
    });

    processingDetails.totalStores = formattedStores.length;

    // After formatting stores
    logger.info("Store details before processing:", {
      filepath,
      stores: formattedStores.map((store) => ({
        place_id: store.place_id,
        name: store.name,
        reviews_count: store.reviews_count,
        hasReviewsCount: "reviews_count" in store,
        rawReviewsCount: store.reviews?.length || 0,
      })),
    });

    // Process stores and track results
    const processedStores = [];

    for (const store of formattedStores) {
      try {
        logger.info(`\n${"=".repeat(80)}\nProcessing Store: ${store.name}`, {
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

          // logger.info(`Store Processing Skipped`, {
          //   filepath,
          //   section: "SKIP",
          //   details: {
          //     storeId: store.place_id,
          //     reason: `Insufficient reviews (${store.reviews_count}/10 required)`,
          //   },
          // });

          logger.info(`${"=".repeat(80)}\n`, {
            filepath,
            place_id: store.place_id,
            section: "END",
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

        logger.info(`${"=".repeat(80)}\n`, {
          filepath,
          place_id: store.place_id,
          section: "END",
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

        logger.info(`${"=".repeat(80)}\n`, {
          filepath,
          place_id: store.place_id,
          section: "END",
        });
      }
    }

    // Write successful stores to database
    if (processedStores.length > 0) {
      logger.info(`\n${"*".repeat(80)}\nStarting Database Write`, {
        filepath,
        section: "DATABASE_START",
        details: {
          storesToProcess: processedStores.length,
        },
      });

      try {
        const { successful, failed } = await writeAISummariesToDb(
          processedStores
        );

        // Add any failed writes to our failedStores array
        failed.forEach((store) => {
          processingDetails.failedStores.push({
            place_id: store.place_id,
            error: `Database write failed: ${store.error || "Unknown error"}`,
          });
        });

        // Update processedStores to only contain successfully written stores
        processedStores.length = 0;
        processedStores.push(...successful);

        if (failed.length > 0) {
          logger.warn(`Some stores failed to write to database`, {
            filepath,
            successfulCount: successful.length,
            failedCount: failed.length,
          });
        }
      } catch (error) {
        // Catastrophic database failure - all stores failed
        processedStores.forEach((store) => {
          processingDetails.failedStores.push({
            place_id: store.place_id,
            error: `Database write failed: ${error.message}`,
          });
        });

        logger.error(`Failed to write to database`, {
          filepath,
          error: error.message,
          failedStoresCount: processedStores.length,
        });

        // Clear processedStores since none were successfully saved
        processedStores.length = 0;
      }

      logger.info(`${"*".repeat(80)}\n`, {
        filepath,
        section: "DATABASE_END",
      });
    }

    processingDetails.finishedAt = new Date().toISOString();

    // Calculate duration in seconds
    const durationSeconds = (
      (new Date(processingDetails.finishedAt) -
        new Date(processingDetails.startedAt)) /
      1000
    ).toFixed(1);

    logger.info(
      `AI Processing Complete: ${processedStores.length}/${processingDetails.totalStores} stores processed`,
      {
        filepath,
        summary: {
          successful: processedStores.length,
          failed: processingDetails.failedStores.length,
          skipped: processingDetails.skippedStores.length,
          total: processingDetails.totalStores,
          duration: `${durationSeconds}s`,
          successRate: `${(
            (processedStores.length / processingDetails.totalStores) *
            100
          ).toFixed(1)}%`,
        },
        skippedStores: processingDetails.skippedStores,
        failedStores: processingDetails.failedStores.map((store) => ({
          id: store.place_id,
          error: store.error,
        })),
      }
    );

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
