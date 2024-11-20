import { Router } from "express";
import scrapeRoutes from "./scrape.routes.js";
import healthRoutes from "./health.routes.js";
import aiRoutes from "./ai.routes.js";

const router = Router();

router.use("/", healthRoutes);
router.use("/scrape", scrapeRoutes);
router.use("/ai", aiRoutes);

export default router;
