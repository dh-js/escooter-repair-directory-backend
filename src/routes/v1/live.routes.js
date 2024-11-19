import { Router } from "express";
import { crawlerGooglePlaces } from "../../services/apifyService.js";
import {
  writeApifyRunDetails,
  writeStores,
} from "../../services/supabaseService.js";
import logger from "../../utils/logger.js";
import { liveConfig } from "../../config/scrapeConfig.js";

const filepath = "routes/v1/live.routes.js";
const router = Router();

// Extract the scraping logic into a separate function
export async function runLiveScrape() {
  try {
    logger.info("Starting live scrape job...", { filepath });

    // Process each state sequentially
    for (const state of liveConfig.states) {
      logger.info(`Starting scrape for state: ${state}`, { filepath });

      const { stores, runDetails, validationFailures } =
        await crawlerGooglePlaces(
          liveConfig.searchQueries,
          state,
          "", // empty city for state-wide search
          liveConfig.maxResults
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

      // Store the run details
      await writeApifyRunDetails(runDetails);

      logger.info(`Scrape job completed for ${state}`, {
        filepath,
        runId: runDetails.runId,
        storesProcessed: stores.length,
      });
    }

    return true;
  } catch (error) {
    logger.error("Scrape job failed:", error, { filepath });
    throw error;
  }
}

// Simplified route handler that calls the extracted function
router.post("/scrape", async (req, res, next) => {
  try {
    logger.info("Triggering new live scrape job...", { filepath });

    // Send immediate response
    res.json({
      success: true,
      message: "Scrape job triggered successfully",
      startedAt: new Date().toISOString(),
    });

    // Run the scrape job
    await runLiveScrape();
  } catch (error) {
    logger.error("Scrape job failed:", error, { filepath });
    // Since we already sent the response, we just log the error
  }
});

export default router;
