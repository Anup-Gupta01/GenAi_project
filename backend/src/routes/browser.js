import { Router } from "express";
import { browserService } from "../services/browserService.js";
import { browserTools } from "../services/browserTools.js";

const router = Router();

/**
 * GET /api/browser/status
 * Returns current browser instance status and active URL if any.
 */
router.get("/status", (_req, res) => {
  const running = browserService.isRunning();
  const currentUrl = browserService.getCurrentUrl();

  return res.json({
    status: "ok",
    running,
    currentUrl,
  });
});

/**
 * POST /api/browser/open
 * Body: { "url": "https://example.com" }
 * Navigates to an HTTP(S) URL and returns page info.
 */
router.post("/open", async (req, res) => {
  const { url } = req.body || {};

  if (!url || typeof url !== "string") {
    return res.status(400).json({
      status: "error",
      message: "Field 'url' is required and must be an HTTP or HTTPS URL string.",
    });
  }

  const result = await browserTools.openPage(url);
  if (!result.success) {
    const isClientError = result.error?.includes("Forbidden URL scheme") || result.error?.includes("Invalid URL");
    return res.status(isClientError ? 400 : 502).json({
      status: "error",
      message: result.error,
    });
  }

  return res.json({
    status: "ok",
    data: result,
  });
});

/**
 * GET /api/browser/info
 * Returns the current URL and title of the active browser page.
 */
router.get("/info", async (_req, res) => {
  const result = await browserTools.getPageInfo();
  if (!result.success) {
    return res.status(400).json({
      status: "error",
      message: result.error,
    });
  }

  return res.json({
    status: "ok",
    data: result,
  });
});

/**
 * GET /api/browser/content
 * Query: ?maxLength=10000 (optional)
 * Returns visible page text capped to maxLength characters.
 */
router.get("/content", async (req, res) => {
  const maxLengthParam = req.query.maxLength ? parseInt(req.query.maxLength, 10) : undefined;
  const result = await browserTools.getPageContent({ maxLength: maxLengthParam });

  if (!result.success) {
    return res.status(400).json({
      status: "error",
      message: result.error,
    });
  }

  return res.json({
    status: "ok",
    data: result,
  });
});

/**
 * POST /api/browser/click
 * Body: { "selector": "button#submit" }
 * Clicks a selector on the active page.
 */
router.post("/click", async (req, res) => {
  const { selector } = req.body || {};
  if (!selector || typeof selector !== "string") {
    return res.status(400).json({
      status: "error",
      message: "Field 'selector' is required and must be a non-empty string.",
    });
  }

  const result = await browserTools.clickElement(selector);
  if (!result.success) {
    return res.status(400).json({
      status: "error",
      message: result.error,
    });
  }

  return res.json({
    status: "ok",
    data: result,
  });
});

/**
 * POST /api/browser/fill
 * Body: { "selector": "input#search", "value": "my query" }
 * Fills an input or textarea on the active page.
 */
router.post("/fill", async (req, res) => {
  const { selector, value } = req.body || {};
  if (!selector || typeof selector !== "string") {
    return res.status(400).json({
      status: "error",
      message: "Field 'selector' is required and must be a non-empty string.",
    });
  }
  if (value === undefined || typeof value !== "string") {
    return res.status(400).json({
      status: "error",
      message: "Field 'value' is required and must be a string.",
    });
  }

  const result = await browserTools.fillInput(selector, value);
  if (!result.success) {
    return res.status(400).json({
      status: "error",
      message: result.error,
    });
  }

  return res.json({
    status: "ok",
    data: result,
  });
});

/**
 * POST /api/browser/close
 * Cleanly closes the active browser instance and all contexts/pages.
 */
router.post("/close", async (_req, res) => {
  await browserService.close();
  return res.json({
    status: "ok",
    message: "Browser closed successfully.",
  });
});

export default router;
