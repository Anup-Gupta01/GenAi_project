import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  AgentService,
  validateToolCall,
  AGENT_TOOL_DEFINITIONS,
  agentService,
} from "../src/services/agentService.js";
import { browserService } from "../src/services/browserService.js";

describe("Agent Tool Call Validation & Definitions", () => {
  test("tool definitions include all 5 browser tools", () => {
    const names = AGENT_TOOL_DEFINITIONS.map((t) => t.function.name);
    assert.deepStrictEqual(names.sort(), [
      "clickElement",
      "fillInput",
      "getPageContent",
      "getPageInfo",
      "openPage",
    ]);
  });

  test("validateToolCall handles openPage arguments", () => {
    const valid = validateToolCall("openPage", { url: "https://example.com" });
    assert.strictEqual(valid.valid, true);
    assert.strictEqual(valid.sanitizedArgs.url, "https://example.com");

    const invalid = validateToolCall("openPage", { url: "" });
    assert.strictEqual(invalid.valid, false);
    assert.match(invalid.error, /required and must be a non-empty string/);
  });

  test("validateToolCall handles getPageInfo", () => {
    const res = validateToolCall("getPageInfo", {});
    assert.strictEqual(res.valid, true);
  });

  test("validateToolCall handles getPageContent with length clamping", () => {
    const res1 = validateToolCall("getPageContent", { maxLength: 100 });
    assert.strictEqual(res1.valid, true);
    assert.strictEqual(res1.sanitizedArgs.maxLength, 100);

    const res2 = validateToolCall("getPageContent", { maxLength: 99999 });
    assert.strictEqual(res2.valid, true);
    assert.strictEqual(res2.sanitizedArgs.maxLength, 20000); // clamped
  });

  test("validateToolCall handles clickElement arguments", () => {
    const valid = validateToolCall("clickElement", { selector: "button#submit" });
    assert.strictEqual(valid.valid, true);
    assert.strictEqual(valid.sanitizedArgs.selector, "button#submit");

    const invalid = validateToolCall("clickElement", { selector: "" });
    assert.strictEqual(invalid.valid, false);
    assert.match(invalid.error, /selector.*required/i);
  });

  test("validateToolCall handles fillInput arguments", () => {
    const valid = validateToolCall("fillInput", {
      selector: "input#q",
      value: "hello",
    });
    assert.strictEqual(valid.valid, true);
    assert.strictEqual(valid.sanitizedArgs.value, "hello");

    const invalidType = validateToolCall("fillInput", {
      selector: "input#q",
      value: 12345,
    });
    assert.strictEqual(invalidType.valid, false);
    assert.match(invalidType.error, /must be a string/i);
  });

  test("validateToolCall rejects unknown tools", () => {
    const res = validateToolCall("executeShell", { command: "dir" });
    assert.strictEqual(res.valid, false);
    assert.match(res.error, /Unknown tool/);
  });

  test("validateToolCall handles stringified JSON arguments", () => {
    const res = validateToolCall(
      "openPage",
      '{"url": "https://example.com"}'
    );
    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.sanitizedArgs.url, "https://example.com");

    const malformed = validateToolCall("openPage", "{ invalid json }");
    assert.strictEqual(malformed.valid, false);
    assert.match(malformed.error, /Malformed JSON arguments/);
  });
});

describe("AgentService Deterministic Execution Loop (Mocked)", () => {
  test("completes task after tool execution and model response", async () => {
    const service = new AgentService();

    // Mock tool implementations
    const mockTools = {
      openPage: async (url) => ({
        success: true,
        url,
        title: "Mock Title",
        status: 200,
      }),
    };

    let turn = 0;
    const mockFetch = async () => {
      turn++;
      if (turn === 1) {
        // Turn 1: Model requests tool call
        return {
          ok: true,
          json: async () => ({
            message: {
              role: "assistant",
              content: "",
              tool_calls: [
                {
                  id: "call_1",
                  function: {
                    name: "openPage",
                    arguments: { url: "https://example.com" },
                  },
                },
              ],
            },
          }),
        };
      } else {
        // Turn 2: Model finishes with answer
        return {
          ok: true,
          json: async () => ({
            message: {
              role: "assistant",
              content: "The page has been opened and the title is Mock Title.",
            },
          }),
        };
      }
    };

    const result = await service.runTask("Open https://example.com", {
      fetchImpl: mockFetch,
      toolImpls: mockTools,
    });

    assert.strictEqual(result.status, "completed");
    assert.strictEqual(result.toolExecutionCount, 1);
    assert.strictEqual(result.trace.length, 1);
    assert.strictEqual(result.trace[0].tool, "openPage");
    assert.strictEqual(result.trace[0].status, "success");
    assert.strictEqual(result.trace[0].result.title, "Mock Title");
    assert.match(result.finalAnswer, /Mock Title/);
  });

  test("handles unknown tool calls by feeding error back to model", async () => {
    const service = new AgentService();
    let turn = 0;

    const mockFetch = async () => {
      turn++;
      if (turn === 1) {
        return {
          ok: true,
          json: async () => ({
            message: {
              role: "assistant",
              content: "",
              tool_calls: [
                {
                  id: "call_unknown",
                  function: {
                    name: "unsupportedTool",
                    arguments: {},
                  },
                },
              ],
            },
          }),
        };
      } else {
        return {
          ok: true,
          json: async () => ({
            message: {
              role: "assistant",
              content: "I cannot execute unsupported tools.",
            },
          }),
        };
      }
    };

    const result = await service.runTask("Do unsupported thing", {
      fetchImpl: mockFetch,
      toolImpls: {},
    });

    assert.strictEqual(result.status, "completed");
    assert.strictEqual(result.toolExecutionCount, 1);
    assert.strictEqual(result.trace[0].status, "error");
    assert.match(result.trace[0].error, /Unknown tool/);
    assert.strictEqual(result.finalAnswer, "I cannot execute unsupported tools.");
  });

  test("handles invalid tool arguments cleanly", async () => {
    const service = new AgentService();
    let turn = 0;

    const mockFetch = async () => {
      turn++;
      if (turn === 1) {
        return {
          ok: true,
          json: async () => ({
            message: {
              role: "assistant",
              content: "",
              tool_calls: [
                {
                  id: "call_bad_args",
                  function: {
                    name: "openPage",
                    arguments: { url: "" },
                  },
                },
              ],
            },
          }),
        };
      } else {
        return {
          ok: true,
          json: async () => ({
            message: {
              role: "assistant",
              content: "Cannot proceed with empty URL.",
            },
          }),
        };
      }
    };

    const result = await service.runTask("Open empty URL", {
      fetchImpl: mockFetch,
      toolImpls: {},
    });

    assert.strictEqual(result.trace[0].status, "error");
    assert.match(result.trace[0].error, /required and must be a non-empty string/);
  });

  test("enforces maximum tool execution limit", async () => {
    const service = new AgentService();

    // Mock tool that keeps succeeding
    const mockTools = {
      getPageInfo: async () => ({ success: true, url: "https://example.com", title: "Test" }),
    };

    // Model that loops infinitely
    const mockFetch = async () => ({
      ok: true,
      json: async () => ({
        message: {
          role: "assistant",
          content: "",
          tool_calls: [
            {
              id: "loop_call",
              function: {
                name: "getPageInfo",
                arguments: {},
              },
            },
          ],
        },
      }),
    });

    const result = await service.runTask("Infinite loop task", {
      fetchImpl: mockFetch,
      toolImpls: mockTools,
      maxSteps: 3,
    });

    assert.strictEqual(result.status, "limit_reached");
    assert.strictEqual(result.toolExecutionCount, 3);
    assert.strictEqual(result.trace.length, 3);
    assert.match(result.finalAnswer, /Maximum tool execution limit reached/);
  });

  test("handles Ollama server network failure cleanly", async () => {
    const service = new AgentService();
    const mockFetch = async () => {
      throw new Error("connect ECONNREFUSED 127.0.0.1:11434");
    };

    const result = await service.runTask("Failing task", {
      fetchImpl: mockFetch,
    });

    assert.strictEqual(result.status, "failed");
    assert.match(result.finalAnswer, /ECONNREFUSED/);
    assert.strictEqual(result.trace[0].status, "error");
  });

  test("handles Ollama timeout cleanly", async () => {
    const service = new AgentService();
    const mockFetch = async (_url, options) => {
      // Simulate timeout
      const err = new Error("The operation was aborted");
      err.name = "AbortError";
      throw err;
    };

    const result = await service.runTask("Timeout task", {
      fetchImpl: mockFetch,
      ollamaTimeoutMs: 100,
    });

    assert.strictEqual(result.status, "failed");
    assert.match(result.finalAnswer, /timed out/);
  });

  test("prevents concurrent tasks with mutex lock", async () => {
    const service = new AgentService();

    let releaseFirst;
    const firstTaskPromise = new Promise((resolve) => {
      releaseFirst = resolve;
    });

    const slowFetch = async () => {
      await firstTaskPromise;
      return {
        ok: true,
        json: async () => ({
          message: { role: "assistant", content: "Done" },
        }),
      };
    };

    // Start first task (holds lock)
    const run1 = service.runTask("Task 1", { fetchImpl: slowFetch });

    // Attempt concurrent second task while first is in-flight
    await assert.rejects(
      async () => {
        await service.runTask("Task 2", { fetchImpl: slowFetch });
      },
      (err) => {
        assert.strictEqual(err.code, "CONCURRENT_TASK_LOCKED");
        return true;
      }
    );

    // Release first task
    releaseFirst();
    const res1 = await run1;
    assert.strictEqual(res1.status, "completed");

    // Lock is now free, third task can run
    const res3 = await service.runTask("Task 3", {
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({
          message: { role: "assistant", content: "Task 3 done" },
        }),
      }),
    });
    assert.strictEqual(res3.status, "completed");
  });
});

describe("Local Live Integration Test (qwen2.5:7b + Browser)", () => {
  after(async () => {
    await browserService.close();
  });

  test(
    "real autonomous agent execution against https://example.com",
    { timeout: 45000 },
    async () => {
      const task = "Open https://example.com and tell me the page title";

      const result = await agentService.runTask(task, {
        maxSteps: 3,
        ollamaTimeoutMs: 30000,
      });

      assert.strictEqual(result.status, "completed");
      assert.ok(result.toolExecutionCount >= 1, "Agent should execute at least 1 tool");
      assert.ok(result.trace.length >= 1, "Trace should record tool execution");
      assert.strictEqual(result.trace[0].tool, "openPage");
      assert.strictEqual(result.trace[0].status, "success");
      assert.ok(
        result.finalAnswer.toLowerCase().includes("example domain"),
        `Expected final answer to mention "Example Domain", got: ${result.finalAnswer}`
      );
    }
  );
});

describe("Agent API Input Validation & Status", () => {
  let app;
  let server;
  let baseUrl;

  before(async () => {
    const express = (await import("express")).default;
    app = express();
    app.use(express.json());
    app.use("/api/agent", (await import("../src/routes/agent.js")).default);
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  test("rejects empty task with HTTP 400", async () => {
    const res = await fetch(`${baseUrl}/api/agent/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task: "" }),
    });
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.strictEqual(body.status, "error");
    assert.match(body.message, /Field 'task' is required/);
  });

  test("rejects missing task with HTTP 400", async () => {
    const res = await fetch(`${baseUrl}/api/agent/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.strictEqual(body.status, "error");
  });

  test("rejects oversized task (>2000 chars) with HTTP 400", async () => {
    const longTask = "x".repeat(2005);
    const res = await fetch(`${baseUrl}/api/agent/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task: longTask }),
    });
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.strictEqual(body.status, "error");
    assert.match(body.message, /exceeds maximum allowed length/);
  });

  test("GET /api/agent/status returns agent availability", async () => {
    const res = await fetch(`${baseUrl}/api/agent/status`);
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.status, "ok");
    assert.strictEqual(typeof body.busy, "boolean");
  });
});

