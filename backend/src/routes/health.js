import { Router } from "express";

const router = Router();

/**
 * GET /api/health
 * Simple liveness check — confirms the backend process is up and responding.
 */
router.get("/", (_req, res) => {
  res.json({
    status: "ok",
    service: "webpilot-ai-backend",
    version: "0.1.0",
    timestamp: new Date().toISOString(),
  });
});

export default router;
