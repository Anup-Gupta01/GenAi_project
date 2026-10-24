import { browserService } from "./browserService.js";

/**
 * Private / loopback address detection.
 *
 * SECURITY POLICY — localhost & private IP navigation:
 * -------------------------------------------------------
 * This is a local-only, single-user development tool with no publicly reachable
 * surface and no multi-tenant risk. Given this context:
 *
 *  - localhost and private IP navigation is PERMITTED for developer use
 *    (e.g. testing a local app at http://localhost:3000).
 *
 *  - This helper detects private addresses so they are flagged in logs for
 *    auditability. Callers may tighten policy in the future without API changes.
 *
 *  - Prompt-injection SSRF risk: an untrusted web page could instruct the agent
 *    to navigate to http://localhost:3001/api/... and read internal API data.
 *    The system prompt tells the agent to reject such commands from web pages.
 *    Developers should be aware of this risk if this tool is ever exposed to
 *    external untrusted task inputs or operated in a multi-user context.
 *
 * @param {URL} parsed
 * @returns {boolean}
 */
function isPrivateUrl(parsed) {
  const h = parsed.hostname.toLowerCase();
  return (
    h === "localhost" ||
    h === "127.0.0.1" ||
    h === "::1" ||
    h.startsWith("10.") ||
    h.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h)
  );
}

/**
 * Validates that a given URL string is syntactically valid and uses http: or https: scheme.
 * Disallows file:, javascript:, data:, ftp:, and all other non-web schemes.
 *
 * @param {string} rawUrl
 * @returns {{ valid: boolean, url?: string, isPrivate?: boolean, error?: string }}
 */
export function validateUrl(rawUrl) {
  if (typeof rawUrl !== "string" || !rawUrl.trim()) {
    return {
      valid: false,
      error: "URL is required and must be a non-empty string.",
    };
  }

  let parsed;
  try {
    parsed = new URL(rawUrl.trim());
  } catch (err) {
    return {
      valid: false,
      error: `Invalid URL format: ${err.message}`,
    };
  }

  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== "http:" && protocol !== "https:") {
    return {
      valid: false,
      error: `Forbidden URL scheme '${protocol}'. Only 'http:' and 'https:' are allowed.`,
    };
  }

  const priv = isPrivateUrl(parsed);
  if (priv) {
    // Log for auditability — permitted per local-dev policy (see note above).
    console.log(`[browserTools] Navigating to private/local address: ${parsed.hostname}`);
  }

  return {
    valid: true,
    url: parsed.toString(),
    isPrivate: priv,
  };
}

/**
 * Tool 1: openPage(url)
 * Navigates to an HTTP or HTTPS URL and returns the final URL, page title, and HTTP status.
 *
 * @param {string} rawUrl
 * @returns {Promise<{ success: boolean, url?: string, title?: string, status?: number, isPrivate?: boolean, error?: string }>}
 */
export async function openPage(rawUrl) {
  const validation = validateUrl(rawUrl);
  if (!validation.valid) {
    return {
      success: false,
      error: validation.error,
    };
  }

  try {
    const page = await browserService.getPage();
    const response = await page.goto(validation.url, {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });

    const finalUrl = page.url();
    const title = await page.title();
    const httpStatus = response ? response.status() : 200;

    return {
      success: true,
      url: finalUrl,
      title,
      status: httpStatus,
      // Surface private flag for logging/audit (not an error)
      ...(validation.isPrivate ? { isPrivate: true } : {}),
    };
  } catch (err) {
    return {
      success: false,
      error: `Navigation failed: ${err.message}`,
    };
  }
}

/**
 * Tool 2: getPageInfo()
 * Returns the current page URL and title.
 *
 * @returns {Promise<{ success: boolean, url?: string, title?: string, error?: string }>}
 */
export async function getPageInfo() {
  if (!browserService.isRunning()) {
    return {
      success: false,
      error: "No active browser page. Navigate to a page first with openPage.",
    };
  }

  try {
    const page = await browserService.getPage();
    const url = page.url();
    const title = await page.title();

    return {
      success: true,
      url,
      title,
    };
  } catch (err) {
    return {
      success: false,
      error: `Failed to get page info: ${err.message}`,
    };
  }
}

/**
 * Tool 3: getPageContent(options)
 * Returns readable visible page text, capped to a sensible maximum length.
 * Untrusted page text is returned as raw text data without execution.
 *
 * Hard cap: 20,000 chars (matches the agent-side validateToolCall cap so the
 * LLM never receives more content than it can reliably process).
 *
 * @param {{ maxLength?: number }} [options]
 * @returns {Promise<{ success: boolean, url?: string, content?: string, contentLength?: number, returnedLength?: number, truncated?: boolean, error?: string }>}
 */
export async function getPageContent({ maxLength = 10000 } = {}) {
  if (!browserService.isRunning()) {
    return {
      success: false,
      error: "No active browser page. Navigate to a page first with openPage.",
    };
  }

  // Hard cap at 20,000 chars — same ceiling as validateToolCall in agentService.
  const maxChars =
    Number.isInteger(maxLength) && maxLength > 0
      ? Math.min(maxLength, 20000)
      : 10000;

  try {
    const page = await browserService.getPage();
    const bodyLocator = page.locator("body");
    const rawText = (await bodyLocator.innerText({ timeout: 5000 })) || "";

    // Normalize multiple blank lines and tabs, compact excess line breaks.
    // Webpage text is treated as UNTRUSTED DATA — never evaluated or executed.
    const cleanedText = rawText
      .replace(/\r\n/g, "\n")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    const truncated = cleanedText.length > maxChars;
    const content = truncated ? cleanedText.slice(0, maxChars) : cleanedText;

    return {
      success: true,
      url: page.url(),
      contentLength: cleanedText.length,
      returnedLength: content.length,
      truncated,
      content,
    };
  } catch (err) {
    return {
      success: false,
      error: `Failed to read page content: ${err.message}`,
    };
  }
}

/**
 * Tool 4: clickElement(selector, options)
 * Clicks a CSS selector or visible text, and returns a clear success or failure result.
 *
 * @param {string} selector
 * @param {{ timeout?: number }} [options]
 * @returns {Promise<{ success: boolean, selector: string, message?: string, error?: string }>}
 */
export async function clickElement(selector, { timeout = 4000 } = {}) {
  if (typeof selector !== "string" || !selector.trim()) {
    return {
      success: false,
      selector: selector || "",
      error: "Selector is required and must be a non-empty string.",
    };
  }

  if (!browserService.isRunning()) {
    return {
      success: false,
      selector: selector.trim(),
      error: "No active browser page. Navigate to a page first with openPage.",
    };
  }

  const trimmedSelector = selector.trim();
  try {
    const page = await browserService.getPage();
    try {
      await page.click(trimmedSelector, { timeout });
    } catch (primaryErr) {
      // If primary selector failed and does not look like complex CSS, attempt text fallback
      const isPlainWord =
        !trimmedSelector.startsWith(".") &&
        !trimmedSelector.startsWith("#") &&
        !trimmedSelector.includes("[") &&
        !trimmedSelector.startsWith("text=");
      if (isPlainWord) {
        try {
          await page.click(`text="${trimmedSelector}"`, { timeout: 2000 });
        } catch (_) {
          throw primaryErr;
        }
      } else {
        throw primaryErr;
      }
    }

    return {
      success: true,
      selector: trimmedSelector,
      message: `Clicked element matching '${trimmedSelector}'.`,
    };
  } catch (err) {
    return {
      success: false,
      selector: trimmedSelector,
      error: `Click failed for selector '${trimmedSelector}': ${err.message}`,
    };
  }
}

/**
 * Tool 5: fillInput(selector, value, options)
 * Fills a matching input or textarea with the given text value.
 *
 * @param {string} selector
 * @param {string} value
 * @param {{ timeout?: number }} [options]
 * @returns {Promise<{ success: boolean, selector: string, message?: string, error?: string }>}
 */
export async function fillInput(selector, value, { timeout = 8000 } = {}) {
  if (typeof selector !== "string" || !selector.trim()) {
    return {
      success: false,
      selector: selector || "",
      error: "Selector is required and must be a non-empty string.",
    };
  }

  if (typeof value !== "string") {
    return {
      success: false,
      selector: selector.trim(),
      error: "Value is required and must be a string.",
    };
  }

  if (!browserService.isRunning()) {
    return {
      success: false,
      selector: selector.trim(),
      error: "No active browser page. Navigate to a page first with openPage.",
    };
  }

  const trimmedSelector = selector.trim();
  try {
    const page = await browserService.getPage();
    await page.fill(trimmedSelector, value, { timeout });

    return {
      success: true,
      selector: trimmedSelector,
      message: `Filled input '${trimmedSelector}' successfully.`,
    };
  } catch (err) {
    return {
      success: false,
      selector: trimmedSelector,
      error: `Fill failed for selector '${trimmedSelector}': ${err.message}`,
    };
  }
}

/**
 * Registry of available browser tools
 */
export const browserTools = {
  openPage,
  getPageInfo,
  getPageContent,
  clickElement,
  fillInput,
};

export default browserTools;
