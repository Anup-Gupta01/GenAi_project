import "dotenv/config";
import express from "express";
import healthRouter from "./routes/health.js";
import ollamaRouter from "./routes/ollama.js";
import browserRouter from "./routes/browser.js";

const PORT = process.env.PORT || 3001;
const app = express();

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(express.json());

// Simple request logger (dev-friendly, no extra deps)
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/api/health", healthRouter);
app.use("/api/ollama", ollamaRouter);
app.use("/api/browser", browserRouter);

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ status: "error", message: "Route not found" });
});

// ── Global error handler ──────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error("[ERROR]", err);
  res.status(500).json({ status: "error", message: "Internal server error" });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log("╔══════════════════════════════════════╗");
  console.log("║   WebPilot AI — Backend v0.1.0       ║");
  console.log("╚══════════════════════════════════════╝");
  console.log(`Server listening on http://localhost:${PORT}`);
  console.log(`Health:         http://localhost:${PORT}/api/health`);
  console.log(`Ollama status:  http://localhost:${PORT}/api/ollama/status`);
  console.log(`Browser tools:  http://localhost:${PORT}/api/browser/status`);
  console.log("────────────────────────────────────────");
});
