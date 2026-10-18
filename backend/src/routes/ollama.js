import { Router } from "express";

const router = Router();

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
const TIMEOUT_MS = 4000; // 4 s — fail fast if Ollama is not running

/**
 * GET /api/ollama/status
 *
 * Checks whether the local Ollama server is reachable and returns the list
 * of locally available model tags.
 *
 * Does NOT download models or expose secrets.
 * Returns a clean JSON response in both success and error cases.
 */
router.get("/status", async (_req, res) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    // Ollama exposes its model list at GET /api/tags
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!response.ok) {
      return res.status(502).json({
        status: "error",
        reachable: false,
        message: `Ollama responded with HTTP ${response.status}`,
        ollamaUrl: OLLAMA_BASE_URL,
      });
    }

    const data = await response.json();

    // data.models is an array of { name, modified_at, size, ... }
    const models = (data.models || []).map((m) => ({
      name: m.name,
      size: m.size,
      modifiedAt: m.modified_at,
    }));

    return res.json({
      status: "ok",
      reachable: true,
      ollamaUrl: OLLAMA_BASE_URL,
      modelCount: models.length,
      models,
    });
  } catch (err) {
    clearTimeout(timer);

    const isTimeout = err.name === "AbortError";
    return res.status(503).json({
      status: "error",
      reachable: false,
      ollamaUrl: OLLAMA_BASE_URL,
      message: isTimeout
        ? `Ollama did not respond within ${TIMEOUT_MS}ms — is it running? Start it with: ollama serve`
        : `Could not reach Ollama: ${err.message}`,
    });
  }
});

export default router;
