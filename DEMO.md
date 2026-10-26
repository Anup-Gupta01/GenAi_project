# WebPilot AI — Demonstration Guide & Resume Highlights

This document provides a structured, verifiable 3–5 minute presentation script for demonstrating WebPilot AI, followed by a factual, resume-ready engineering summary.

---

## Part 1: 3–5 Minute Live Demo Script

### Target Audience
Engineering leads, hiring managers, and AI systems developers.

### Demo Objective
Demonstrate an autonomous, local-first browser agent that executes real web tasks using open-weight LLM function calling and Playwright automation with zero cloud dependencies and a strict ₹0 budget.

---

### Step-by-Step Presentation Script

#### 1. The Hook & Problem Statement (0:00 – 0:45)
- **Speaker:**
  > "Today I'm presenting **WebPilot AI**, a local-first autonomous browser agent. Most browser automation is either brittle procedural scripts that break on DOM changes, or expensive cloud AI agents that leak browsing privacy, require cloud subscriptions, and cost money per token.
  > WebPilot AI solves this by connecting a local 7-billion parameter language model directly to Playwright browser automation on the local machine with zero cloud API keys, zero token fees, and zero cloud data leaks."

#### 2. Architecture & Local Model Setup (0:45 – 1:30)
- **Visual:** Show Ollama running in terminal (`ollama list`) and the React dashboard (`http://localhost:5173`).
- **Speaker:**
  > "Under the hood, we have:
  > - **Qwen 2.5 7B** running locally via Ollama on port 11434.
  > - An **Express.js backend** running on port 3001 that coordinates the agent loop, enforces safety guardrails, and drives Playwright.
  > - A **React and Tailwind dashboard** on port 5173.
  > Notice the status pill at the top: the dashboard directly pings `/api/ollama/status` to confirm model readiness before any task can even be submitted."

#### 3. Submitting a Natural-Language Task (1:30 – 2:30)
- **Action:** In the prompt box, type:
  ```text
  Open https://example.com and tell me its page title.
  ```
  Click **Run Task**.
- **Speaker:**
  > "I'm giving the agent a natural-language prompt: *'Open https://example.com and tell me its page title.'*
  > When I click 'Run Task', the backend initiates our deterministic agent loop:
  > 1. The prompt and 5 registered browser tool schemas (`openPage`, `getPageInfo`, `getPageContent`, `clickElement`, `fillInput`) are sent to `qwen2.5:7b`.
  > 2. The model reasons that it needs to view the webpage and emits a structured tool call: `openPage` with the URL argument.
  > 3. Playwright launches an isolated Chromium instance and navigates to the target page."

#### 4. Inspecting the Real Execution Trace (2:30 – 3:30)
- **Visual:** Point to the completed task result card and the **Execution Trace** accordion.
- **Speaker:**
  > "The task completed with status `completed`.
  > Look at the final answer: *'The page title of the example.com website is "Example Domain".'*
  > More importantly, look at the verifiable **Execution Trace**:
  > - **Step 1**: Tool `openPage`, arguments `{"url": "https://example.com"}`.
  > - **Status**: `success`, duration: ~4.5 seconds.
  > - **Tool Output**: Status 200, URL, and page title.
  > The model received this structured output in its context history, recognized that it had satisfied the user's objective, and synthesized the final human-readable answer without hallucination."

#### 5. Safety & Reliability Features (3:30 – 4:15)
- **Speaker:**
  > "A core focus of our Day 5 work was reliability and safety:
  > - **Scheme Guardrails**: The agent strictly validates URL schemes. If an adversarial prompt attempts `file:///etc/passwd` or `javascript:...`, the tool rejects it prior to browser execution.
  > - **Loop & Timeout Caps**: The agent loop is hard-budgeted to at most 8 tool steps and an overall 60-second timeout, returning a distinct `limit_reached` status if thresholds are hit.
  > - **Concurrency Mutex**: An in-memory lock prevents concurrent web tasks from clobbering the shared Playwright session, returning HTTP 409 if a second task is submitted while one is active."

#### 6. Honest Limitations & Future Roadmap (4:15 – 4:45)
- **Speaker:**
  > "To be transparent about current limitations:
  > - CPU inference on a cold 7B model takes 30-40 seconds for the first token generation.
  > - Traces are currently returned upon completion rather than streamed step-by-step via Server-Sent Events.
  > Our next milestone focuses on Server-Sent Events for real-time trace streaming and per-task browser context isolation."

---

## Part 2: Resume-Ready Project Description

### Bullet-Point Version (Ideal for Resume / CV)

**WebPilot AI — Local Autonomous Browser Automation Agent**  
*Node.js, Express, Playwright, React, Vite, Ollama, Qwen 2.5 7B, Tailwind CSS*
- Architected an open-source, local-first browser agent orchestrating Playwright automation via local LLM function calling (`qwen2.5:7b` on Ollama) under a strict ₹0 cloud budget.
- Developed an Express backend implementing an iterative agent loop with an 8-step budget, 60s hard timeout, and in-memory concurrency mutex preventing cross-task browser pollution.
- Implemented defensive security guardrails rejecting unauthorized URL schemes (`file:`, `javascript:`, `data:`), clamping page extraction to 20k chars, and logging private IP navigation.
- Built a reactive React dashboard displaying real-time agent status, execution durations, and step-by-step structured traces (`tool`, `arguments`, `latency`, `result`).
- Authored 75 automated tests across unit, mocked-loop, and live end-to-end integration suites asserting deterministic tool invocation against real web targets.

---

### Extended Narrative Version (Ideal for Portfolio / LinkedIn)

> **WebPilot AI** is an autonomous, privacy-preserving browser automation agent built to operate entirely on consumer hardware without external cloud APIs. By coupling an Express.js orchestration backend with Playwright and Ollama's local `qwen2.5:7b` function calling, WebPilot converts natural language instructions into multi-step browser actions.
> 
> The system features five registered browser tools (`openPage`, `getPageInfo`, `getPageContent`, `clickElement`, `fillInput`), robust fault tolerance (step limits, action timeouts, mutex-locked single-task concurrency), and strict input sanitization. The client interface provides a real-time execution trace detailing each tool invocation, argument payload, latency, and status. The entire project is validated with 75 automated tests including live model-and-browser integration tests against live domains.
