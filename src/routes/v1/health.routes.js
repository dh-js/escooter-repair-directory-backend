import { Router } from "express";

const router = Router();

router.get("/healthz", (req, res) => {
  res.status(200).json({ status: "OK" });
});

export default router;
