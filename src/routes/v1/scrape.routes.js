import { Router } from "express";
import { crawlerGooglePlaces } from "../../services/apifyService.js";
import {
  writeApifyRunDetails,
  writeStores,
} from "../../services/supabaseServicesScrape.js";
import logger from "../../utils/logger.js";
import { scrapeConfig } from "../../config/scrapeConfig.js";
import { fetchAndTransformDataset } from "../../services/apifyService.js";

const filepath = "routes/v1/scrape.routes.js";
const router = Router();

// Add batch configuration at the top
const BATCH_SIZE = 25;
const BATCH_DELAY_MS = 5000; // Add delay between batches

// Helper function to process a single state
async function processSingleState(state) {
  try {
    logger.info(`Starting scrape for state: ${state}`, { filepath });

    const { stores, runDetails, validationFailures } =
      await crawlerGooglePlaces(
        scrapeConfig.searchQueries,
        state,
        "",
        scrapeConfig.maxResults
      );

    // Store the results
    try {
      const storeResults = await writeStores(stores);
      runDetails.store_processing_results = {
        ...storeResults,
        validationFailures,
      };
    } catch (storeError) {
      logger.error(`Failed to write stores for ${state}:`, storeError, {
        filepath,
      });
      runDetails.store_processing_results = {
        error: storeError.message,
      };
    }

    await writeApifyRunDetails(runDetails);

    logger.info(`Scrape job completed for ${state}`, {
      filepath,
      runId: runDetails.runId,
      storesProcessed: stores.length,
    });

    return {
      state,
      success: true,
      storesProcessed: stores.length,
      runId: runDetails.runId,
    };
  } catch (error) {
    logger.error(`Scrape job failed for ${state}:`, error, { filepath });
    return {
      state,
      success: false,
      error: error.message,
      storesProcessed: 0,
    };
  }
}

// Modified runScrape function with improved batch handling
export async function runScrape() {
  try {
    logger.info("Starting batched scrape jobs...", { filepath });
    const results = [];
    const totalBatches = Math.ceil(scrapeConfig.states.length / BATCH_SIZE);
    const startTime = new Date();

    for (let i = 0; i < scrapeConfig.states.length; i += BATCH_SIZE) {
      const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
      const stateBatch = scrapeConfig.states.slice(i, i + BATCH_SIZE);

      logger.info(`Processing batch ${batchNumber}/${totalBatches}`, {
        filepath,
        states: stateBatch,
        remainingStates: scrapeConfig.states.length - (i + BATCH_SIZE),
      });

      const batchPromises = stateBatch.map((state) =>
        processSingleState(state)
      );
      const batchResults = await Promise.allSettled(batchPromises);
      results.push(...batchResults);

      // Add delay between batches
      if (batchNumber < totalBatches) {
        await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
      }
    }

    // Enhanced summary with more details
    const summary = results.reduce(
      (acc, result, index) => {
        const state = scrapeConfig.states[index];
        if (result.status === "fulfilled" && result.value.success) {
          acc.successful.push(state);
          acc.totalStoresProcessed += result.value.storesProcessed;
          acc.runIds.push(result.value.runId);
        } else {
          acc.failed.push({
            state,
            error:
              result.status === "rejected" ? result.reason : result.value.error,
          });
        }
        return acc;
      },
      {
        successful: [],
        failed: [],
        totalStoresProcessed: 0,
        runIds: [],
        startTime: startTime,
        endTime: new Date(),
        totalDurationMs: 0,
      }
    );

    summary.totalDurationMs = summary.endTime - summary.startTime;

    logger.info("All scrape jobs completed", {
      filepath,
      successfulStates: summary.successful.length,
      failedStates: summary.failed.length,
      totalStoresProcessed: summary.totalStoresProcessed,
      totalDurationMs: summary.totalDurationMs,
      details: summary,
    });

    return summary;
  } catch (error) {
    logger.error("Main scrape job coordinator failed:", error, { filepath });
    throw error;
  }
}

// Simplified route handler that calls the extracted function
router.post("/process", async (req, res, next) => {
  try {
    logger.info("Triggering new live scrape job...", { filepath });

    // Send immediate response
    res.json({
      success: true,
      message: "Scrape job triggered successfully",
      startedAt: new Date().toISOString(),
    });

    // Run the scrape job
    await runScrape();
  } catch (error) {
    logger.error("Scrape job failed:", error, { filepath });
    // Since we already sent the response, we just log the error
  }
});

// Add this new route handler
router.post("/write-dataset/:datasetId", async (req, res) => {
  try {
    const { datasetId } = req.params;

    if (!datasetId) {
      return res.status(400).json({
        success: false,
        error: "Dataset ID is required",
      });
    }

    logger.info(`Starting to process dataset: ${datasetId}`, { filepath });

    // Fetch and transform the dataset
    const { stores, validationFailures, totalProcessed } =
      await fetchAndTransformDataset(datasetId);

    if (!stores?.length) {
      return res.status(404).json({
        success: false,
        error: "No valid stores found in dataset",
        totalProcessed,
        validationFailures,
      });
    }

    // Write to Supabase using existing writeStores function
    const results = await writeStores(stores);

    logger.info(`Dataset processing complete`, {
      filepath,
      datasetId,
      results,
    });

    res.json({
      success: true,
      datasetId,
      results,
      totalProcessed,
      validStores: stores.length,
      validationFailures,
    });
  } catch (error) {
    logger.error("Failed to process dataset:", {
      filepath,
      error: error.message,
      stack: error.stack,
      datasetId: req.params.datasetId,
    });

    res.status(500).json({
      success: false,
      error: error.message,
      datasetId: req.params.datasetId,
    });
  }
});

export default router;
