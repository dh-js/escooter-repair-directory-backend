import { Router } from "express";
import scrapeRoutes from "./scrape.routes.js";
import aiRoutes from "./ai.routes.js";
import searchRoutes from "./search.routes.js";

const router = Router();

router.use("/scrape", scrapeRoutes);
router.use("/ai", aiRoutes);
router.use("/search", searchRoutes);

export default router;
