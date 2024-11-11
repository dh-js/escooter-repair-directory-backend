import { Router } from "express";
import { crawlerGooglePlaces } from "../../services/apifyService.js";

const router = Router();

router.get("/healthz", (req, res) => {
  res.status(200).json({ status: "OK" });
});

router.post("/runScrape", async (req, res, next) => {
  try {
    const { searchQuery } = req.body;
    const shops = await crawlerGooglePlaces(searchQuery);

    res.json({ success: true, count: shops.length });
  } catch (error) {
    next(error);
  }
});

export default router;
