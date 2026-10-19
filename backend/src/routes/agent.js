import { Router } from "express";
import { agentService } from "../services/agentService.js";

const router = Router();

/**
 * GET /api/agent/status
 * Check if the agent is currently executing a task.
 */
router.get("/status", (_req, res) => {
  return res.json({
    status: "ok",
    busy: agentService.isTaskRunning,
  });
});

/**
 * POST /api/agent/run
 * Body: { "task": "Open https://example.com and tell me the page title" }
 *
 * Runs an autonomous agent loop coordinating Ollama and Playwright browser tools.
 */
router.post("/run", async (req, res) => {
  const { task } = req.body || {};

  if (!task || typeof task !== "string" || !task.trim()) {
    return res.status(400).json({
      status: "error",
      message: "Field 'task' is required and must be a non-empty string.",
    });
  }

  if (task.trim().length > 2000) {
    return res.status(400).json({
      status: "error",
      message: "Task description exceeds maximum allowed length of 2000 characters.",
    });
  }

  try {
    const result = await agentService.runTask(task.trim());
    return res.json({
      status: "ok",
      data: result,
    });
  } catch (err) {
    if (err.code === "CONCURRENT_TASK_LOCKED") {
      return res.status(409).json({
        status: "error",
        message: err.message,
      });
    }

    return res.status(500).json({
      status: "error",
      message: `Agent execution failed: ${err.message}`,
    });
  }
});

export default router;
