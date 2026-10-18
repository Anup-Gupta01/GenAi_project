import { chromium } from "playwright";

/**
 * BrowserService
 *
 * Manages a reusable, isolated Playwright Chromium instance.
 * - Lazily launches only on demand.
 * - Reuses the instance across tool calls to avoid overhead.
 * - Uses an isolated context (incognito, zero profile/cookie leakage).
 * - Implements clean teardown and process exit cleanup.
 */
class BrowserService {
  constructor() {
    this.browser = null;
    this.context = null;
    this.page = null;
    this.isLaunching = false;
    this._setupProcessHooks();
  }

  _setupProcessHooks() {
    const cleanup = async () => {
      try {
        await this.close();
      } catch (_err) {
        // Silently handle during shutdown
      }
    };
    process.once("exit", cleanup);
    process.once("SIGINT", cleanup);
    process.once("SIGTERM", cleanup);
  }

  /**
   * Check whether the browser, context, and page are currently active.
   * @returns {boolean}
   */
  isRunning() {
    return Boolean(
      this.browser &&
      this.browser.isConnected() &&
      this.page &&
      !this.page.isClosed()
    );
  }

  /**
   * Returns the active Playwright Page, or launches a fresh isolated instance if none exists.
   * @returns {Promise<import('playwright').Page>}
   */
  async getPage() {
    if (this.isRunning()) {
      return this.page;
    }

    if (this.isLaunching) {
      while (this.isLaunching) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      if (this.isRunning()) return this.page;
    }

    this.isLaunching = true;
    try {
      // Teardown any stale instances before launching
      await this.close();

      this.browser = await chromium.launch({
        headless: true,
      });

      // Isolated context: fresh session, no personal profiles or saved cookies
      this.context = await this.browser.newContext({
        viewport: { width: 1280, height: 720 },
        userAgent: "WebPilot-AI-Browser/0.1 (+https://github.com/Anup-Gupta01/GenAi_project)",
        ignoreHTTPSErrors: false,
      });

      this.page = await this.context.newPage();

      // Configure default timeouts
      this.page.setDefaultTimeout(8000); // 8s for actions (click, fill)
      this.page.setDefaultNavigationTimeout(15000); // 15s for navigation

      // If browser disconnects externally, clear internal state
      this.browser.on("disconnected", () => {
        this.page = null;
        this.context = null;
        this.browser = null;
      });

      return this.page;
    } finally {
      this.isLaunching = false;
    }
  }

  /**
   * Returns current URL if a page is open, otherwise null.
   * @returns {string|null}
   */
  getCurrentUrl() {
    if (this.isRunning() && this.page) {
      try {
        return this.page.url();
      } catch (_err) {
        return null;
      }
    }
    return null;
  }

  /**
   * Closes the active page, context, and browser cleanly.
   */
  async close() {
    try {
      if (this.page && !this.page.isClosed()) {
        await this.page.close().catch(() => {});
      }
      if (this.context) {
        await this.context.close().catch(() => {});
      }
      if (this.browser && this.browser.isConnected()) {
        await this.browser.close().catch(() => {});
      }
    } finally {
      this.page = null;
      this.context = null;
      this.browser = null;
    }
  }
}

export const browserService = new BrowserService();
export default browserService;
