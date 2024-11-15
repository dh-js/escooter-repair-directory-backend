import { Router } from "express";
import { crawlerGooglePlaces } from "../../services/apifyService.js";
import {
  writeApifyRunDetails,
  writeStores,
} from "../../services/supabaseService.js";
import logger from "../../utils/logger.js";
import config from "../../config/config.js";

const filepath = "routes/v1/index.js";
const router = Router();

router.get("/healthz", (req, res) => {
  res.status(200).json({ status: "OK" });
});

router.get("/test-scrape", async (req, res, next) => {
  try {
    logger.info("Starting test scrape...", { filepath });
    const { stores, runDetails, rawItems } = await crawlerGooglePlaces(
      ["electric scooter repair"],
      "Florida",
      "",
      5
    );

    // Store the run details and capture the result
    const runResult = await writeApifyRunDetails(runDetails);
    logger.info("Apify run details stored", {
      filepath,
      runId: runResult.run_id,
    });

    // Store the scraped stores
    const storeResults = await writeStores(stores);

    logger.info(`Test scrape completed`, {
      filepath,
      scrapedCount: stores.length,
      storedCount: storeResults.successful,
      newStores: storeResults.newStores,
      updatedStores: storeResults.updatedStores,
      failedStores: storeResults.failed,
    });

    // Return different responses based on environment
    if (config.nodeEnv === "development") {
      res.json({
        success: true,
        storeResults,
        runDetails,
        comparison: stores.map((store, index) => ({
          transformed: store,
          original: rawItems[index],
        })),
      });
    } else {
      res.json({
        success: true,
        message: "Scrape completed successfully",
        summary: {
          totalScraped: stores.length,
          storedSuccessfully: storeResults.successful,
          newStores: storeResults.newStores,
          updatedStores: storeResults.updatedStores,
          failed: storeResults.failed,
        },
      });
    }
  } catch (error) {
    logger.error("Test scrape failed:", error, { filepath });
    // Pass to error handling middleware
    next(error);
  }
});

export default router;
