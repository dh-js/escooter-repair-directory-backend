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
};

const AI_CONFIG = {
  MAX_REVIEWS: 300,
  MAX_QAS: 300,
};

export async function runAIProcessing() {
  const processingDetails = {
    startedAt: new Date().toISOString(),
    totalStores: 0,
    failedStores: [],
  };

  try {
    logger.info("Starting AI processing job...", { filepath });

    // Get stores based on the desired mode:
    const fetchedStores = await fetchStoresDb(AI_PROCESSING_MODES.SINGLE);

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
    // Clear fetchedStores as no longer needed
    fetchedStores.length = 0;

    // Validation for formatted stores
    if (!formattedStores?.length) {
      throw new Error("Store formatting failed");
    }

    logger.info("Number of fetched stores:", {
      filepath,
      totalFetched: fetchedStores.length,
    });
    logger.info("Number of formatted stores:", {
      filepath,
      totalFormatted: formattedStores.length,
    });

    processingDetails.totalStores = formattedStores.length;

    // Process stores and track results
    const processedStores = [];

    for (const store of formattedStores) {
      try {
        const aiSummary = await claudeAPICall(store);

        if (!aiSummary?.summary_text || !aiSummary?.token_usage) {
          throw new Error("Invalid AI summary structure received");
        }

        processedStores.push({
          place_id: store.place_id,
          ai_summary: aiSummary,
        });

        logger.info(`Successfully processed store`, {
          filepath,
          storeId: store.place_id,
          progress: `${processedStores.length}/${processingDetails.totalStores}`,
          tokenUsage: aiSummary.token_usage,
        });
      } catch (error) {
        processingDetails.failedStores.push({
          place_id: store.place_id,
          error: error.message,
        });

        logger.error(`Failed to process store: ${error.message}`, {
          filepath,
          storeId: store.place_id,
          error: error.message,
          stack: error.stack,
        });
      }
    }

    // Write successful stores to database
    if (processedStores.length > 0) {
      try {
        logger.info(`Starting database write`, {
          filepath,
          storesToProcess: processedStores.length,
        });

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
    }

    processingDetails.finishedAt = new Date().toISOString();

    // Calculate duration in seconds
    const durationSeconds = (
      (new Date(processingDetails.finishedAt) -
        new Date(processingDetails.startedAt)) /
      1000
    ).toFixed(1);

    logger.info(
      `AI Processing Complete: ${processedStores.length}/${processingDetails.totalStores} stores successful (${durationSeconds}s)`,
      {
        filepath,
        summary: {
          successful: processedStores.length,
          failed: processingDetails.failedStores.length,
          total: processingDetails.totalStores,
          duration: `${durationSeconds}s`,
          successRate: `${(
            (processedStores.length / processingDetails.totalStores) *
            100
          ).toFixed(1)}%`,
        },
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
