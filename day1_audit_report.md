# WebPilot AI — Day 1: Environment Audit Report
**Date:** 2026-10-17 | **Workspace:** `d:\Gen_ai_project`

---

## A. Environment Audit Results

### 1. Operating System
| Property | Value |
|---|---|
| OS | Windows 10 Home Single Language |
| Version | 21H2 (build 2009) |
| Architecture | 64-bit |

### 2. Hardware Resources
| Component | Details |
|---|---|
| CPU | AMD Ryzen 7 5800HS — 8 cores / 16 threads @ 3.2 GHz |
| RAM | **16 GB** total |
| GPU | AMD Radeon (iGPU) — 512 MB dedicated VRAM (shared RAM) |
| C: Drive (System) | 34.95 GB free / 274.59 GB total |
| D: Drive (Workspace) | **41.15 GB free** / 200 GB total |

### 3. Node.js & npm
| Tool | Version | Status |
|---|---|---|
| Node.js | **v22.13.1** | ✅ Installed — LTS, excellent |
| npm | **10.9.2** | ✅ Installed — current |

### 4. Git
| Property | Value |
|---|---|
| Version | **2.44.0.windows.1** | ✅ Installed |
| Repository Status | ❌ `d:\Gen_ai_project` is NOT a Git repository yet |
| Existing commits | None |

### 5. Workspace Contents
- `d:\Gen_ai_project` is **completely empty** — clean slate, no existing files.

### 6. Ollama
| Status | Details |
|---|---|
| Installation | ❌ **Not installed** — `ollama` command not found in PATH |
| Local models | None available |

### 7. Playwright
| Status | Details |
|---|---|
| Global install | ❌ Not installed globally |
| Browser binaries | ❌ Not found at `%LOCALAPPDATA%\ms-playwright` |
| Latest version available (npm) | **1.64.1** (confirmed via `npx playwright --version`) |

---

## B. Missing Prerequisites

| # | Prerequisite | Status | Priority |
|---|---|---|---|
| 1 | Ollama (LLM runtime) | ❌ Missing | 🔴 Critical |
| 2 | A local LLM model | ❌ Missing | 🔴 Critical |
| 3 | Playwright + browser binaries | ❌ Missing | 🔴 Critical |
| 4 | Git repository initialized | ❌ Missing | 🔴 Critical |
| 5 | `.gitignore` for the project | ❌ Missing | 🟠 Required before first commit |

> Everything else (Node.js, npm, Git itself) is already in good shape.

---

## C. Recommended Zero-Cost Setup for This Machine

### LLM Model Recommendation

Your machine has a **Ryzen 7 5800HS (16 threads) + 16 GB RAM** with only an integrated GPU (512 MB VRAM — unusable for LLM inference). LLM inference will run entirely on **CPU RAM**.

> [!IMPORTANT]
> With 16 GB RAM and CPU-only inference, a **3B–7B parameter model quantized to Q4** is the sweet spot.

| Model | Size on disk | RAM needed | Quality | Recommendation |
|---|---|---|---|---|
| `llama3.2:3b` | ~2 GB | ~3.5 GB | Good for tool-calling | ✅ **Best fit — fast** |
| `qwen2.5:7b` | ~4.7 GB | ~6 GB | Excellent tool-calling | ✅ **Best fit — smarter** |
| `mistral:7b` | ~4.1 GB | ~5.5 GB | Good general purpose | ✅ Viable |
| `llama3.1:8b` | ~4.9 GB | ~7 GB | Best reasoning | ⚠️ Slow on CPU-only |

**Primary recommendation: `qwen2.5:7b`** — Qwen 2.5 has strong structured output and tool-calling support, which is critical for an agent that must select browser tools reliably.
**Fallback: `llama3.2:3b`** — If `qwen2.5:7b` is too slow in practice, drop to 3b for speed.

### Full Stack (Zero Cost)

```
Frontend  : React + Vite + Tailwind CSS  (dashboard, execution logs)
Backend   : Node.js + Express.js          (agent orchestration, Playwright controller)
Browser   : Playwright (Chromium)         (dedicated, isolated browser window)
LLM       : Ollama + qwen2.5:7b           (local inference, zero cost)
LangChain : langchain + @langchain/ollama (tool selection and agent loop)
VCS       : Git (local only until you approve a remote push)
```

---

## D. Hardware & Compatibility Risks

| Risk | Severity | Mitigation |
|---|---|---|
| **CPU-only inference** — No discrete GPU or CUDA | 🟠 Medium | Use a ≤7B Q4 model; accept 2–10s response times per agent step |
| **C: drive low** (34.95 GB free) | 🟠 Medium | Install Ollama models to D: drive; set `OLLAMA_MODELS` env var |
| **iGPU VRAM too small** for GPU offloading (512 MB) | 🔴 Confirmed | Run 100% CPU; Ollama handles this automatically |
| **16 GB RAM** — leaves ~8–10 GB after OS overhead | 🟡 Low-medium | Sufficient for a 7B Q4 model + browser + Node server |
| **Windows 10 Home** — no WSL2 GPU passthrough (irrelevant here) | 🟡 Low | No impact; Ollama runs natively on Windows |
| **D: drive space (41 GB)** | 🟡 Low | Enough for models + project; monitor if downloading multiple models |

---

## E. Exact Next Steps for Day 1

> [!NOTE]
> Run these **in order**, one at a time. Do not proceed to the next step without my confirmation.

### Step 1 — Install Ollama
Download and install from [https://ollama.com/download/windows](https://ollama.com/download/windows).
After install, verify with:
```powershell
ollama --version
```

### Step 2 — Redirect model storage to D: drive (before pulling any model)
Set the environment variable so models don't fill your C: drive:
```powershell
# Run in PowerShell as Administrator, then restart terminal
[System.Environment]::SetEnvironmentVariable("OLLAMA_MODELS", "D:\ollama_models", "Machine")
```

### Step 3 — Pull the recommended model
```powershell
ollama pull qwen2.5:7b
```
*(~4.7 GB download — use your best internet connection)*

### Step 4 — Initialize the Git repository
```powershell
cd d:\Gen_ai_project
git init
git config user.name  "Your Name"
git config user.email "your@email.com"
```

### Step 5 — Create `.gitignore` (before any file is added)
Contents should include at minimum:
```
node_modules/
.env
*.log
dist/
playwright-report/
test-results/
D:\ollama_models/   # (models stored externally anyway)
```

### Step 6 — Initial commit
```powershell
git add .gitignore
git commit -m "chore: initialize repository with .gitignore"
```

### Step 7 — Install Playwright (project-local, Day 2)
This will be done inside the project after the scaffold is created:
```powershell
npm install playwright
npx playwright install chromium
```

---

## Day 1 Completion Checklist

- [ ] Ollama installed and `ollama --version` works
- [ ] `OLLAMA_MODELS` env var set to `D:\ollama_models`
- [ ] `qwen2.5:7b` model pulled and visible in `ollama list`
- [ ] Git repository initialized at `d:\Gen_ai_project`
- [ ] `.gitignore` created and committed
- [ ] **Await approval before Day 2 scaffold begins**
