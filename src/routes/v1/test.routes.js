import { Router } from "express";
import { crawlerGooglePlaces } from "../../services/apifyService.js";
import {
  writeApifyRunDetails,
  writeStores,
} from "../../services/supabaseService.js";
import logger from "../../utils/logger.js";
import { testConfig } from "../../config/scrapeConfig.js";

const filepath = "routes/v1/test.routes.js";
const router = Router();

router.get("/scrape", async (req, res, next) => {
  try {
    logger.info("Starting test scrape...", { filepath });

    const allResults = [];

    for (const state of testConfig.states) {
      logger.info(`Testing scrape for state: ${state}`, { filepath });

      const { stores, runDetails, rawItems, validationFailures } =
        await crawlerGooglePlaces(
          testConfig.searchQueries,
          state,
          "", // empty city for state-wide search
          testConfig.maxResults
        );

      // Try to store the scraped stores
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

      // Store the run details regardless of store operation success
      await writeApifyRunDetails(runDetails);

      allResults.push({
        state,
        stores,
        runDetails,
        comparison: stores.map((store, index) => ({
          transformed: store,
          original: rawItems[index],
        })),
      });
    }

    // Return combined results
    res.json({
      success: true,
      results: allResults,
    });
  } catch (error) {
    logger.error("Test scrape failed:", error, { filepath });
    next(error);
  }
});

export default router;
