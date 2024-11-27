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

// Helper function to process a single dataset
async function processSingleDataset(datasetId) {
  try {
    logger.info(`Processing dataset: ${datasetId}`, { filepath });

    const { stores, validationFailures, totalProcessed } =
      await fetchAndTransformDataset(datasetId);

    if (!stores?.length) {
      return {
        success: false,
        datasetId,
        error: "No valid stores found in dataset",
        totalProcessed,
        validationFailures,
      };
    }

    const results = await writeStores(stores);

    return {
      success: true,
      datasetId,
      results,
      totalProcessed,
      validStores: stores.length,
      validationFailures,
    };
  } catch (error) {
    logger.error(`Failed to process dataset: ${datasetId}`, {
      filepath,
      error: error.message,
    });
    return {
      success: false,
      datasetId,
      error: error.message,
    };
  }
}

// Updated route handler
router.post("/write-dataset/:datasetIds", async (req, res) => {
  try {
    const { datasetIds } = req.params;
    const datasetIdArray = datasetIds.split(",").map((id) => id.trim());

    if (!datasetIdArray.length) {
      return res.status(400).json({
        success: false,
        error: "At least one dataset ID is required",
      });
    }

    logger.info(`Starting to process ${datasetIdArray.length} datasets`, {
      filepath,
      datasetIds: datasetIdArray,
    });

    // Process datasets sequentially
    const results = [];
    for (const datasetId of datasetIdArray) {
      const result = await processSingleDataset(datasetId);
      results.push(result);
    }

    // Calculate summary
    const summary = {
      totalDatasetsProcessed: results.length,
      successful: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      totalStoresProcessed: results.reduce(
        (sum, r) => sum + (r.validStores || 0),
        0
      ),
      results,
    };

    logger.info(`Completed processing all datasets`, {
      filepath,
      summary,
    });

    res.json({
      success: true,
      summary,
    });
  } catch (error) {
    logger.error("Failed to process datasets:", {
      filepath,
      error: error.message,
      stack: error.stack,
    });

    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;
