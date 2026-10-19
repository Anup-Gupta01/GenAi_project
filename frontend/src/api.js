/**
 * api.js — thin wrapper around the WebPilot AI backend.
 *
 * Never calls Ollama directly. The base URL comes from the VITE_API_BASE_URL
 * environment variable so it can differ between local dev and any future
 * deployment without touching source code.
 */

const BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";

/**
 * Generic fetch helper.
 * Throws an Error with a human-readable message on network failure or
 * non-OK HTTP status.
 */
async function apiFetch(path, init = {}, timeoutMs = 60000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
    });
  } catch (err) {
    clearTimeout(timer);
    if (err.name === "AbortError") {
      throw new Error(`Request to ${path} timed out after ${timeoutMs / 1000}s.`);
    }
    throw new Error(
      `Cannot reach the backend at ${BASE}. Is the server running? (${err.message})`
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    let msg = `Backend returned HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body?.message) msg = body.message;
    } catch (_) {}
    throw new Error(msg);
  }

  return res.json();
}

/** GET /api/health */
export async function fetchHealth() {
  return apiFetch("/api/health", {}, 5000);
}

/** GET /api/ollama/status */
export async function fetchOllamaStatus() {
  return apiFetch("/api/ollama/status", {}, 8000);
}

/** GET /api/agent/status */
export async function fetchAgentStatus() {
  return apiFetch("/api/agent/status", {}, 5000);
}

/**
 * POST /api/agent/run
 * @param {string} task — natural language instruction
 * @returns {Promise<{status:string, data:{status:string,finalAnswer:string,trace:Array,toolExecutionCount:number,durationMs:number}}>}
 */
export async function runAgentTask(task) {
  return apiFetch(
    "/api/agent/run",
    {
      method: "POST",
      body: JSON.stringify({ task }),
    },
    95000 // 95s — comfortably above the agent's internal 90s limit
  );
}
