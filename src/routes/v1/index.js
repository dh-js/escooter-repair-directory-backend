import { Router } from "express";
import liveRoutes from "./live.routes.js";
import testRoutes from "./test.routes.js";
import healthRoutes from "./health.routes.js";

const router = Router();

router.use("/", healthRoutes);
router.use("/live", liveRoutes);
router.use("/test", testRoutes);

export default router;
