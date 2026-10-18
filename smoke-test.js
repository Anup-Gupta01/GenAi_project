/**
 * WebPilot AI -- Day 1 Playwright Smoke Test
 *
 * Verifies that:
 *  1. Playwright can launch its managed Chromium browser (isolated, no personal profile)
 *  2. The browser can navigate to a simple public page
 *  3. The page title can be read and asserted
 *  4. Page content is present (first paragraph text)
 *  5. The browser closes cleanly with no dangling processes
 *
 * Run with:  node smoke-test.js
 */

const { chromium } = require('playwright');

(async () => {
  const TARGET_URL = 'https://example.com';
  const EXPECTED_TITLE = 'Example Domain';
  const EXPECTED_BODY_FRAGMENT = 'This domain is for use in documentation';

  console.log('=== WebPilot AI -- Playwright Smoke Test ===\n');

  let browser;
  try {
    // 1. Launch Playwright-managed Chromium (NOT system Chrome / user profile)
    console.log('[1/4] Launching Playwright Chromium (headless)...');
    browser = await chromium.launch({ headless: true });
    console.log('      OK - Browser launched.\n');

    // 2. Open a new isolated browser context (no cookies, no profile)
    console.log('[2/4] Opening isolated browser context...');
    const context = await browser.newContext();
    const page = await context.newPage();
    console.log('      OK - Context and page ready.\n');

    // 3. Navigate to target page and verify title
    console.log('[3/4] Navigating to ' + TARGET_URL + ' ...');
    await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
    const title = await page.title();
    console.log('      Page title: "' + title + '"');

    if (title === EXPECTED_TITLE) {
      console.log('      OK - Title matches expected value.\n');
    } else {
      throw new Error('Title mismatch -- expected "' + EXPECTED_TITLE + '", got "' + title + '"');
    }

    // 4. Verify page body content is present
    // Note: example.com (2025 redesign) has no <h1>; content is in <p> and SVG elements.
    console.log('[4/4] Verifying page body content...');
    const bodyText = await page.locator('body').innerText({ timeout: 8000 });
    const snippet = bodyText.trim().substring(0, 80);
    console.log('      Body snippet: "' + snippet + '"');

    if (bodyText.includes(EXPECTED_BODY_FRAGMENT)) {
      console.log('      OK - Expected content found in page body.\n');
    } else {
      throw new Error('Expected fragment not found in page body. Got: ' + snippet);
    }

  } catch (err) {
    console.error('\nSMOKE TEST FAILED: ' + err.message);
    process.exitCode = 1;
  } finally {
    // Always close the browser -- no dangling processes
    if (browser) {
      console.log('[close] Closing browser...');
      await browser.close();
      console.log('        OK - Browser closed cleanly.\n');
    }
  }

  if (process.exitCode !== 1) {
    console.log('==========================================');
    console.log('ALL CHECKS PASSED -- Playwright is working correctly.');
    console.log('==========================================\n');
  }
})();
