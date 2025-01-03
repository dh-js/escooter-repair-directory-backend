import { Router } from "express";
import logger from "../../utils/logger.js";
import { searchStores } from "../../services/supabaseServicesSearch.js";
import { getZipCoordinates } from "../../utils/zipCoordinates.js";

const filepath = "routes/v1/search.routes.js";
const router = Router();

router.get("/", async (req, res) => {
  try {
    const { zipCode, radius } = req.query;

    if (!zipCode) {
      logger.warn("Missing ZIP code parameter", {
        filepath,
        params: { zipCode, radius },
        error: "ZIP code is required",
      });
      return res.status(400).json({
        error: { message: "ZIP code is required" },
      });
    }

    // Validate radius
    const parsedRadius = Number(radius);
    if (isNaN(parsedRadius) || parsedRadius < 1 || parsedRadius > 150) {
      logger.warn("Invalid radius parameter", {
        filepath,
        params: { zipCode, radius: radius },
        error: "Radius must be between 1 and 150 miles",
      });
      return res.status(400).json({
        error: { message: "Radius must be between 1 and 150 miles" },
      });
    }

    // Convert ZIP to coordinates using our local database
    const coordinates = await getZipCoordinates(zipCode);

    logger.info("Processing store search request", {
      filepath,
      params: { zipCode, radius, coordinates },
    });

    const results = await searchStores({
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      radius: parsedRadius,
    });

    logger.info("Search request completed", {
      filepath,
      params: { zipCode, radius },
      resultsCount: results.metadata.count,
    });

    res.json(results);
  } catch (error) {
    logger.error("Search request failed:", error, { filepath });

    if (
      error.message === "ZIP code must be exactly 5 digits" ||
      error.message === "ZIP code not found"
    ) {
      return res.status(400).json({ error: error.message });
    }
    if (error.message === "ZIP code service unavailable") {
      return res.status(503).json({ error: error.message });
    }

    res.status(500).json({
      error: "Failed to process search request",
    });
  }
});

export default router;
