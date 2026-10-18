import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { browserService } from "../src/services/browserService.js";
import {
  validateUrl,
  openPage,
  getPageInfo,
  getPageContent,
  clickElement,
  fillInput,
} from "../src/services/browserTools.js";

describe("Browser Tools & Service", () => {
  after(async () => {
    // Ensure clean browser shutdown after tests
    await browserService.close();
  });

  describe("URL Validation & Scheme Rejection", () => {
    test("rejects non-string and empty inputs", () => {
      assert.strictEqual(validateUrl(null).valid, false);
      assert.strictEqual(validateUrl("").valid, false);
      assert.strictEqual(validateUrl("   ").valid, false);
    });

    test("rejects forbidden non-HTTP(S) schemes", () => {
      const forbidden = [
        "file:///etc/passwd",
        "file:///C:/Windows/win.ini",
        "javascript:alert(1)",
        "data:text/html,<h1>Hello</h1>",
        "ftp://example.com/file",
        "about:blank",
      ];
      for (const raw of forbidden) {
        const res = validateUrl(raw);
        assert.strictEqual(res.valid, false, `Expected ${raw} to be rejected`);
        assert.match(res.error, /Forbidden URL scheme|Invalid URL/);
      }
    });

    test("accepts valid http and https URLs", () => {
      const valid = [
        "https://example.com",
        "http://example.com/test?a=1",
        "https://httpbin.org/get",
      ];
      for (const raw of valid) {
        const res = validateUrl(raw);
        assert.strictEqual(res.valid, true, `Expected ${raw} to be valid`);
        assert.ok(res.url);
      }
    });
  });

  describe("Tool Execution with Forbidden Schemes", () => {
    test("openPage rejects non-http schemes without navigating", async () => {
      const res = await openPage("file:///C:/secret.txt");
      assert.strictEqual(res.success, false);
      assert.match(res.error, /Forbidden URL scheme/);
    });
  });

  describe("Browser Lifecycle & Safe Page Navigation", () => {
    test("lazily launches browser and navigates to https://example.com", async () => {
      assert.strictEqual(browserService.isRunning(), false);

      const res = await openPage("https://example.com");
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.title, "Example Domain");
      assert.ok(res.url.includes("example.com"));
      assert.strictEqual(res.status, 200);

      assert.strictEqual(browserService.isRunning(), true);
    });

    test("getPageInfo returns active page title and url", async () => {
      const info = await getPageInfo();
      assert.strictEqual(info.success, true);
      assert.strictEqual(info.title, "Example Domain");
      assert.ok(info.url.includes("example.com"));
    });

    test("getPageContent extracts readable text and respects maxLength", async () => {
      const contentRes = await getPageContent({ maxLength: 50 });
      assert.strictEqual(contentRes.success, true);
      assert.ok(contentRes.content.length <= 50);
      assert.strictEqual(contentRes.truncated, true);
      assert.ok(contentRes.content.includes("This domain") || contentRes.content.includes("documentation"));
    });

    test("getPageContent returns full text when maxLength is generous", async () => {
      const contentRes = await getPageContent({ maxLength: 5000 });
      assert.strictEqual(contentRes.success, true);
      assert.strictEqual(contentRes.truncated, false);
      assert.ok(contentRes.content.includes("This domain is for use in documentation"));
    });
  });

  describe("Selector and Action Failure Handling", () => {
    test("clickElement fails cleanly on non-existent selector without crashing", async () => {
      const res = await clickElement("#non-existent-button-12345", { timeout: 1000 });
      assert.strictEqual(res.success, false);
      assert.ok(res.error);
      assert.match(res.error, /Click failed/);
    });

    test("clickElement rejects empty selector", async () => {
      const res = await clickElement("");
      assert.strictEqual(res.success, false);
      assert.match(res.error, /Selector is required/);
    });

    test("fillInput fails cleanly on non-existent input without crashing", async () => {
      const res = await fillInput("#missing-input-field", "some text", { timeout: 1000 });
      assert.strictEqual(res.success, false);
      assert.ok(res.error);
      assert.match(res.error, /Fill failed/);
    });

    test("fillInput rejects invalid arguments", async () => {
      const res1 = await fillInput("", "val");
      assert.strictEqual(res1.success, false);
      assert.match(res1.error, /Selector is required/);

      const res2 = await fillInput("#input", 123);
      assert.strictEqual(res2.success, false);
      assert.match(res2.error, /Value is required and must be a string/);
    });
  });

  describe("Navigation Failure Handling", () => {
    test("openPage handles connection failure cleanly without throwing", async () => {
      // Port 65530 on localhost is closed
      const res = await openPage("http://127.0.0.1:65530");
      assert.strictEqual(res.success, false);
      assert.ok(res.error);
      assert.match(res.error, /Navigation failed/);
    });
  });

  describe("Browser Clean Shutdown", () => {
    test("closeBrowser shuts down browser context and page", async () => {
      await browserService.close();
      assert.strictEqual(browserService.isRunning(), false);

      // Subsequent tool calls should report no active browser
      const info = await getPageInfo();
      assert.strictEqual(info.success, false);
      assert.match(info.error, /No active browser/);
    });
  });
});
