/**
 * Day 5 Regression Tests — Reliability, Safety, and Agent Quality
 *
 * Test categories:
 *  A. URL scheme safety & private IP policy (UNIT, no browser)
 *  B. Agent reliability: timeout, limit, malformed response (MOCKED)
 *  C. Safety: forbidden tools, prompt injection protection (MOCKED)
 *  D. Content limits: page content capping (UNIT)
 *  E. API input validation (HTTP integration, no LLM)
 *
 * All tests are labelled [UNIT], [MOCKED], or [INTEGRATION-HTTP].
 * The live LLM + Browser integration test remains in agent.test.js.
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { validateUrl } from "../src/services/browserTools.js";
import {
  AgentService,
  validateToolCall,
  AGENT_CONFIG,
} from "../src/services/agentService.js";

// ─────────────────────────────────────────────────────────────────────────────
// A. URL Scheme Safety & Private IP Policy
// ─────────────────────────────────────────────────────────────────────────────

describe("A — URL Scheme Safety & Private IP Policy [UNIT]", () => {
  test("rejects javascript: scheme", () => {
    const r = validateUrl("javascript:alert('xss')");
    assert.strictEqual(r.valid, false);
    assert.match(r.error, /Forbidden URL scheme/);
  });

  test("rejects file: scheme", () => {
    const r = validateUrl("file:///C:/Windows/win.ini");
    assert.strictEqual(r.valid, false);
    assert.match(r.error, /Forbidden URL scheme/);
  });

  test("rejects data: scheme", () => {
    const r = validateUrl("data:text/html,<h1>Hi</h1>");
    assert.strictEqual(r.valid, false);
    assert.match(r.error, /Forbidden URL scheme/);
  });

  test("rejects ftp: scheme", () => {
    const r = validateUrl("ftp://files.example.com/pub");
    assert.strictEqual(r.valid, false);
    assert.match(r.error, /Forbidden URL scheme/);
  });

  test("rejects about:blank", () => {
    const r = validateUrl("about:blank");
    assert.strictEqual(r.valid, false);
    // about: fails URL parsing, error will be InvalidURL or Forbidden
    assert.strictEqual(r.valid, false);
  });

  test("rejects empty and whitespace strings", () => {
    assert.strictEqual(validateUrl("").valid, false);
    assert.strictEqual(validateUrl("   ").valid, false);
    assert.strictEqual(validateUrl(null).valid, false);
  });

  test("accepts valid https URL", () => {
    const r = validateUrl("https://example.com/path?q=1");
    assert.strictEqual(r.valid, true);
    assert.ok(r.url.includes("example.com"));
    assert.strictEqual(r.isPrivate, false);
  });

  test("accepts valid http URL", () => {
    const r = validateUrl("http://httpbin.org/get");
    assert.strictEqual(r.valid, true);
    assert.strictEqual(r.isPrivate, false);
  });

  // Private IP policy: permitted but flagged
  test("allows localhost navigation and flags it as private [POLICY: local-dev permitted]", () => {
    const r = validateUrl("http://localhost:3000");
    assert.strictEqual(r.valid, true);
    assert.strictEqual(r.isPrivate, true);
  });

  test("allows 127.0.0.1 and flags it as private", () => {
    const r = validateUrl("http://127.0.0.1:8080/api");
    assert.strictEqual(r.valid, true);
    assert.strictEqual(r.isPrivate, true);
  });

  test("allows RFC-1918 10.x.x.x and flags it as private", () => {
    const r = validateUrl("http://10.0.0.1");
    assert.strictEqual(r.valid, true);
    assert.strictEqual(r.isPrivate, true);
  });

  test("allows RFC-1918 192.168.x.x and flags it as private", () => {
    const r = validateUrl("http://192.168.1.100");
    assert.strictEqual(r.valid, true);
    assert.strictEqual(r.isPrivate, true);
  });

  test("allows RFC-1918 172.16.x.x and flags it as private", () => {
    const r = validateUrl("http://172.16.0.1");
    assert.strictEqual(r.valid, true);
    assert.strictEqual(r.isPrivate, true);
  });

  test("does NOT flag public IP as private", () => {
    const r = validateUrl("https://8.8.8.8");
    assert.strictEqual(r.valid, true);
    assert.strictEqual(r.isPrivate, false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B. Agent Reliability
// ─────────────────────────────────────────────────────────────────────────────

describe("B — Agent Reliability [MOCKED]", () => {
  test("enforces configurable 60s overall task timeout", async () => {
    // The default AGENT_CONFIG.maxDurationMs should be 60 000 ms
    assert.strictEqual(AGENT_CONFIG.maxDurationMs, 60000,
      "maxDurationMs must be 60000 per Day-5 spec");
  });

  test("enforces maxSteps = 8 by default", () => {
    assert.strictEqual(AGENT_CONFIG.maxSteps, 8);
  });

  test("returns limit_reached when step cap is hit", async () => {
    const svc = new AgentService();
    const mockTools = {
      getPageInfo: async () => ({ success: true, url: "https://x.com", title: "X" }),
    };
    const mockFetch = async () => ({
      ok: true,
      json: async () => ({
        message: {
          role: "assistant", content: "",
          tool_calls: [{ id: "c1", function: { name: "getPageInfo", arguments: {} } }],
        },
      }),
    });

    const result = await svc.runTask("loop task", {
      fetchImpl: mockFetch,
      toolImpls: mockTools,
      maxSteps: 4,
    });

    assert.strictEqual(result.status, "limit_reached");
    assert.strictEqual(result.toolExecutionCount, 4);
    assert.match(result.finalAnswer, /Maximum tool execution limit/);
  });

  test("returns failed on Ollama connection refused", async () => {
    const svc = new AgentService();
    const result = await svc.runTask("task", {
      fetchImpl: async () => { throw new Error("connect ECONNREFUSED 127.0.0.1:11434"); },
    });
    assert.strictEqual(result.status, "failed");
    assert.match(result.finalAnswer, /ECONNREFUSED/);
    assert.strictEqual(result.trace[0].status, "error");
  });

  test("returns failed on Ollama AbortError (simulated timeout)", async () => {
    const svc = new AgentService();
    const result = await svc.runTask("timeout task", {
      fetchImpl: async () => {
        const e = new Error("The operation was aborted");
        e.name = "AbortError";
        throw e;
      },
      ollamaTimeoutMs: 100,
    });
    assert.strictEqual(result.status, "failed");
    assert.match(result.finalAnswer, /timed out/);
  });

  test("returns failed on malformed Ollama response (missing message)", async () => {
    const svc = new AgentService();
    const result = await svc.runTask("malformed task", {
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({ /* no 'message' field */ }),
      }),
    });
    assert.strictEqual(result.status, "failed");
    assert.match(result.finalAnswer, /Malformed response/);
  });

  test("returns failed on Ollama HTTP 500", async () => {
    const svc = new AgentService();
    const result = await svc.runTask("server error task", {
      fetchImpl: async () => ({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        json: async () => ({ error: "model not loaded" }),
      }),
    });
    assert.strictEqual(result.status, "failed");
    assert.match(result.finalAnswer, /Ollama responded with HTTP 500/);
  });

  test("prevents concurrent tasks with CONCURRENT_TASK_LOCKED error", async () => {
    const svc = new AgentService();
    let release;
    const gate = new Promise((res) => { release = res; });

    const slowFetch = async () => {
      await gate;
      return { ok: true, json: async () => ({ message: { role: "assistant", content: "done" } }) };
    };

    const run1 = svc.runTask("task 1", { fetchImpl: slowFetch });

    await assert.rejects(
      () => svc.runTask("task 2", { fetchImpl: slowFetch }),
      (err) => { assert.strictEqual(err.code, "CONCURRENT_TASK_LOCKED"); return true; }
    );

    release();
    const r1 = await run1;
    assert.strictEqual(r1.status, "completed");
  });

  test("trace preserves step number, tool name, status, and durationMs", async () => {
    const svc = new AgentService();
    let turn = 0;
    const mockTools = { openPage: async (url) => ({ success: true, url, title: "T", status: 200 }) };
    const mockFetch = async () => {
      turn++;
      if (turn === 1) {
        return {
          ok: true,
          json: async () => ({
            message: {
              role: "assistant", content: "",
              tool_calls: [{ id: "c1", function: { name: "openPage", arguments: { url: "https://example.com" } } }],
            },
          }),
        };
      }
      return { ok: true, json: async () => ({ message: { role: "assistant", content: "Done. Title: T" } }) };
    };

    const result = await svc.runTask("trace test", { fetchImpl: mockFetch, toolImpls: mockTools });
    assert.strictEqual(result.status, "completed");
    const step = result.trace[0];
    assert.strictEqual(typeof step.step, "number");
    assert.strictEqual(step.tool, "openPage");
    assert.ok(["success", "error"].includes(step.status));
    assert.ok(typeof step.durationMs === "number" && step.durationMs >= 0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C. Safety: Forbidden Tools & Prompt Injection
// ─────────────────────────────────────────────────────────────────────────────

describe("C — Safety: Forbidden Tools & Input Validation [MOCKED/UNIT]", () => {
  test("validateToolCall rejects executeShell (shell injection)", () => {
    const r = validateToolCall("executeShell", { command: "dir" });
    assert.strictEqual(r.valid, false);
    assert.match(r.error, /Unknown tool/);
  });

  test("validateToolCall rejects evalCode (code injection)", () => {
    const r = validateToolCall("evalCode", { code: "process.exit(1)" });
    assert.strictEqual(r.valid, false);
    assert.match(r.error, /Unknown tool/);
  });

  test("validateToolCall rejects readFile (filesystem access)", () => {
    const r = validateToolCall("readFile", { path: "/etc/passwd" });
    assert.strictEqual(r.valid, false);
    assert.match(r.error, /Unknown tool/);
  });

  test("validateToolCall rejects fetch (arbitrary HTTP bypass)", () => {
    const r = validateToolCall("fetch", { url: "http://internal" });
    assert.strictEqual(r.valid, false);
    assert.match(r.error, /Unknown tool/);
  });

  test("model returning unknown tool feeds error to model (not a crash)", async () => {
    const svc = new AgentService();
    let turn = 0;
    const mockFetch = async () => {
      turn++;
      if (turn === 1) {
        return {
          ok: true,
          json: async () => ({
            message: {
              role: "assistant", content: "",
              tool_calls: [{ id: "c1", function: { name: "dangerousEval", arguments: { code: "1+1" } } }],
            },
          }),
        };
      }
      return { ok: true, json: async () => ({ message: { role: "assistant", content: "I cannot do that." } }) };
    };

    const result = await svc.runTask("do something dangerous", { fetchImpl: mockFetch, toolImpls: {} });
    assert.strictEqual(result.status, "completed");
    assert.strictEqual(result.trace[0].status, "error");
    assert.match(result.trace[0].error, /Unknown tool/);
    assert.strictEqual(result.finalAnswer, "I cannot do that.");
  });

  test("openPage validates URL scheme before navigating (no browser launch)", async () => {
    const { openPage } = await import("../src/services/browserTools.js");
    const r = await openPage("javascript:alert(1)");
    assert.strictEqual(r.success, false);
    assert.match(r.error, /Forbidden URL scheme/);
  });

  test("openPage rejects data: URI (no browser launch)", async () => {
    const { openPage } = await import("../src/services/browserTools.js");
    const r = await openPage("data:text/html,<b>hello</b>");
    assert.strictEqual(r.success, false);
    assert.match(r.error, /Forbidden URL scheme/);
  });

  test("openPage rejects file: URI (no browser launch)", async () => {
    const { openPage } = await import("../src/services/browserTools.js");
    const r = await openPage("file:///C:/Windows/System32/drivers/etc/hosts");
    assert.strictEqual(r.success, false);
    assert.match(r.error, /Forbidden URL scheme/);
  });

  test("validateToolCall sanitizes getPageContent maxLength above 20000", () => {
    const r = validateToolCall("getPageContent", { maxLength: 999999 });
    assert.strictEqual(r.valid, true);
    assert.strictEqual(r.sanitizedArgs.maxLength, 20000);
  });

  test("validateToolCall accepts getPageContent with no arguments", () => {
    const r = validateToolCall("getPageContent", {});
    assert.strictEqual(r.valid, true);
    // Default assigned by validateToolCall
    assert.ok(typeof r.sanitizedArgs.maxLength === "number");
  });

  test("task input over 2000 chars is rejected via API [INTEGRATION-HTTP]", async () => {
    const express = (await import("express")).default;
    const app = express();
    app.use(express.json());
    app.use("/api/agent", (await import("../src/routes/agent.js")).default);

    let server;
    const baseUrl = await new Promise((res) => {
      server = app.listen(0, () => res(`http://127.0.0.1:${server.address().port}`));
    });

    try {
      const resp = await fetch(`${baseUrl}/api/agent/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task: "x".repeat(2001) }),
      });
      assert.strictEqual(resp.status, 400);
      const body = await resp.json();
      assert.match(body.message, /exceeds maximum/);
    } finally {
      await new Promise((res) => server.close(res));
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// D. Content Limits
// ─────────────────────────────────────────────────────────────────────────────

describe("D — Content Limits [UNIT]", () => {
  test("validateToolCall clamps getPageContent maxLength to 20000", () => {
    // Matches the hard cap in browserTools.getPageContent
    const r = validateToolCall("getPageContent", { maxLength: 50000 });
    assert.strictEqual(r.sanitizedArgs.maxLength, 20000);
  });

  test("validateToolCall accepts maxLength of 100", () => {
    const r = validateToolCall("getPageContent", { maxLength: 100 });
    assert.strictEqual(r.sanitizedArgs.maxLength, 100);
  });

  test("validateToolCall uses default maxLength when value is 0 or negative", () => {
    const r0 = validateToolCall("getPageContent", { maxLength: 0 });
    assert.ok(r0.sanitizedArgs.maxLength > 0);

    const rn = validateToolCall("getPageContent", { maxLength: -500 });
    assert.ok(rn.sanitizedArgs.maxLength > 0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E. API Input Validation
// ─────────────────────────────────────────────────────────────────────────────

describe("E — API Input Validation [INTEGRATION-HTTP]", () => {
  let server;
  let baseUrl;

  before(async () => {
    const express = (await import("express")).default;
    const app = express();
    app.use(express.json());
    app.use("/api/agent", (await import("../src/routes/agent.js")).default);
    await new Promise((res) => {
      server = app.listen(0, () => {
        baseUrl = `http://127.0.0.1:${server.address().port}`;
        res();
      });
    });
  });

  after(async () => {
    if (server) await new Promise((res) => server.close(res));
  });

  test("rejects request with no body", async () => {
    const resp = await fetch(`${baseUrl}/api/agent/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.strictEqual(resp.status, 400);
  });

  test("rejects request with empty task string", async () => {
    const resp = await fetch(`${baseUrl}/api/agent/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task: "   " }),
    });
    assert.strictEqual(resp.status, 400);
    const body = await resp.json();
    assert.match(body.message, /required and must be a non-empty string/);
  });

  test("rejects task exceeding 2000 characters", async () => {
    const resp = await fetch(`${baseUrl}/api/agent/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task: "A".repeat(2001) }),
    });
    assert.strictEqual(resp.status, 400);
    const body = await resp.json();
    assert.match(body.message, /exceeds maximum/);
  });

  test("GET /api/agent/status returns busy:false when idle", async () => {
    const resp = await fetch(`${baseUrl}/api/agent/status`);
    assert.strictEqual(resp.status, 200);
    const body = await resp.json();
    assert.strictEqual(body.status, "ok");
    assert.strictEqual(body.busy, false);
  });
});
