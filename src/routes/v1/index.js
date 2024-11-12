import { Router } from "express";
import { crawlerGooglePlaces } from "../../services/apifyService.js";
import logger from "../../utils/logger.js";

const router = Router();

router.get("/healthz", (req, res) => {
  res.status(200).json({ status: "OK" });
});

router.post("/run-scrape", async (req, res, next) => {
  try {
    const { searchQuery, state, city } = req.body;
    const shops = await crawlerGooglePlaces(
      searchQuery,
      state,
      city,
      9999999 // max results unlimited
    );

    res.json({ success: true, count: shops.length });
  } catch (error) {
    next(error);
  }
});

router.get("/test-scrape", async (req, res, next) => {
  try {
    logger.info("Starting test scrape...");
    const results = await crawlerGooglePlaces(
      "electric scooter repair",
      "California",
      "Los Angeles",
      5 // max results
    );
    logger.info(`Test scrape completed with ${results.length} results`);
    res.json(results);
  } catch (error) {
    logger.error("Test scrape failed:", error);
    next(error);
  }
});

export default router;
