import { Router } from "express";
import logger from "../../utils/logger.js";

const filepath = "routes/v1/health.routes.js";
const router = Router();

router.get("/healthz", (req, res) => {
  logger.info("Health check passed", { filepath });
  res.status(200).json({ status: "OK" });
});

export default router;
