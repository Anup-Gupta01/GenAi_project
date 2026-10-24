import { Router } from "express";

const router = Router();

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
const REQUIRED_MODEL = process.env.OLLAMA_MODEL || "qwen2.5:7b";
const TIMEOUT_MS = 4000; // 4 s — fail fast if Ollama is not running

/**
 * Checks if a model in Ollama tags matches the required model name.
 * Handles exact matches, tag defaults, and registry prefixes.
 */
function isMatchingModel(modelName, required) {
  if (!modelName || !required) return false;
  if (modelName === required) return true;
  if (modelName.endsWith(`/${required}`)) return true;
  if (modelName === `${required}:latest`) return true;
  if (!required.includes(":") && modelName.startsWith(`${required}:`)) return true;
  return false;
}

/**
 * GET /api/ollama/status
 *
 * Checks whether the local Ollama server is reachable and whether the
 * configured required model (default: qwen2.5:7b) is loaded and ready.
 *
 * Status states returned:
 * 1. Unreachable (HTTP 503, reachable: false, modelReady: false, reason: "unreachable")
 * 2. Reachable with 0 models (HTTP 200, reachable: true, modelReady: false, reason: "no_models_available")
 * 3. Reachable but required model missing (HTTP 200, reachable: true, modelReady: false, reason: "required_model_missing")
 * 4. Required model available (HTTP 200, reachable: true, modelReady: true, reason: "ready")
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
        modelReady: false,
        reason: "gateway_error",
        message: `Ollama responded with HTTP ${response.status}`,
        ollamaUrl: OLLAMA_BASE_URL,
        requiredModel: REQUIRED_MODEL,
      });
    }

    const data = await response.json();

    // data.models is an array of { name, modified_at, size, ... }
    const models = (data.models || []).map((m) => ({
      name: m.name,
      size: m.size,
      modifiedAt: m.modified_at,
    }));

    if (models.length === 0) {
      return res.json({
        status: "ok",
        reachable: true,
        modelReady: false,
        reason: "no_models_available",
        message: "Ollama is running but has no models loaded. Verify OLLAMA_MODELS storage directory.",
        ollamaUrl: OLLAMA_BASE_URL,
        requiredModel: REQUIRED_MODEL,
        modelCount: 0,
        models: [],
      });
    }

    const matched = models.find((m) => isMatchingModel(m.name, REQUIRED_MODEL));
    if (!matched) {
      return res.json({
        status: "ok",
        reachable: true,
        modelReady: false,
        reason: "required_model_missing",
        message: `Required model '${REQUIRED_MODEL}' is missing. Installed models: ${models.map((m) => m.name).join(", ")}`,
        ollamaUrl: OLLAMA_BASE_URL,
        requiredModel: REQUIRED_MODEL,
        modelCount: models.length,
        models,
      });
    }

    return res.json({
      status: "ok",
      reachable: true,
      modelReady: true,
      reason: "ready",
      message: `Model '${matched.name}' is available and ready for agent tasks.`,
      ollamaUrl: OLLAMA_BASE_URL,
      requiredModel: REQUIRED_MODEL,
      activeModel: matched.name,
      modelCount: models.length,
      models,
    });
  } catch (err) {
    clearTimeout(timer);

    const isTimeout = err.name === "AbortError";
    return res.status(503).json({
      status: "error",
      reachable: false,
      modelReady: false,
      reason: "unreachable",
      ollamaUrl: OLLAMA_BASE_URL,
      requiredModel: REQUIRED_MODEL,
      message: isTimeout
        ? `Ollama did not respond within ${TIMEOUT_MS}ms — is it running? Start it with: ollama serve`
        : `Could not reach Ollama: ${err.message}`,
    });
  }
});

export default router;
