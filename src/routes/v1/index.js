import { Router } from "express";
import { crawlerGooglePlaces } from "../../services/apifyService.js";
import { writeApifyRunDetails } from "../../services/supabaseService.js";
import logger from "../../utils/logger.js";

const filepath = "routes/v1/index.js";
const router = Router();

router.get("/healthz", (req, res) => {
  res.status(200).json({ status: "OK" });
});

router.post("/run-scrape", async (req, res, next) => {
  try {
    const { searchQuery, state, city } = req.body;
    logger.info(`Starting scrape for ${searchQuery} in ${city}, ${state}`, {
      filepath,
    });

    const { items, runInfo } = await crawlerGooglePlaces(
      searchQuery,
      state,
      city,
      9999999 // max results unlimited
    );

    // Store the run details
    await writeApifyRunDetails(runInfo);

    logger.info(`Scrape completed successfully with ${items.length} results`, {
      filepath,
    });
    res.json({ success: true, count: items.length });
  } catch (error) {
    logger.error("Scrape failed:", error, { filepath });
    next(error);
  }
});

router.get("/test-scrape", async (req, res, next) => {
  try {
    logger.info("Starting test scrape...", { filepath });
    const { items, runInfo } = await crawlerGooglePlaces(
      "electric scooter repair",
      "California",
      "Los Angeles",
      5 // max results
    );

    // Store the run details
    await writeApifyRunDetails(runInfo);

    logger.info(`Test scrape completed with ${items.length} results`, {
      filepath,
    });
    res.json({ items, runInfo });
  } catch (error) {
    logger.error("Test scrape failed:", error, { filepath });
    next(error);
  }
});

export default router;
