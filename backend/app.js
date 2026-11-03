// ═══════════════════════════════════════════════════════════════
// app.js — Express server: progressive jobs, per-model retry
// ═══════════════════════════════════════════════════════════════

import "dotenv/config";
import express from "express";
import multer from "multer";
import sharp from "sharp";
import cors from "cors";
import crypto from "crypto";
import { MODELS, runAdapter, getPublicModels, getModelById } from "./adapter.js";


const PORT = process.env.PORT || 4000;
const MAX_CONCURRENT = Number(process.env.MAX_CONCURRENT || 4);
const JOB_TTL_MS = 15 * 60 * 1000;

const OUT_W = 1270;
const OUT_H = 1780;
const FOOTER_H = 240;

// Themed footer with logos, pre-rendered by `npm run footer` (make-footer.js)
const FOOTER_PATH = "./assets/footer-theme.png";
const JPEG_QUALITY = 92;

const app = express();

app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));
app.options(/.*/, cors());

app.use((req, _res, next) => {
  console.log(`➡️ ${new Date().toISOString()} ${req.method} ${req.originalUrl}`);
  next();
});

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// ───────────────── JOB STORE ─────────────────

const jobs = new Map();
let activeRuns = 0;

setInterval(() => {
  const now = Date.now();
  for (const [id, job] of jobs.entries()) {
    if (now - job.createdAt > JOB_TTL_MS) jobs.delete(id);
  }
}, 60_000).unref();

// ───────────────── ROUTES ─────────────────

app.get("/health", (_req, res) =>
  res.json({ ok: true, activeRuns, totalJobs: jobs.size, models: MODELS.length })
);

app.get("/api/models", (_req, res) => res.json(getPublicModels()));

// ── START JOB ──
app.post("/api/generate-image", upload.single("image"), async (req, res) => {
  try {
    const { prompt, modelId, modelIds } = req.body;

    if (!req.file || !prompt) {
      return res.status(400).json({ error: "Image and prompt required" });
    }

    let targets;
    try {
      targets = modelIds ? JSON.parse(modelIds) : modelId ? [modelId] : [MODELS[0].id];
    } catch {
      targets = [MODELS[0].id];
    }

    for (const t of targets) {
      if (!getModelById(t)) return res.status(400).json({ error: `Unknown model: ${t}` });
    }

    const jobId = crypto.randomUUID();
    const now = Date.now();

    jobs.set(jobId, {
      jobId,
      createdAt: now,
      updatedAt: now,
      // Store the original input so we can retry individual runs later
      inputBuffer: req.file.buffer,
      inputMime: req.file.mimetype,
      prompt,
      runs: targets.map((id) => ({
        modelId: id,
        status: "queued",
        step: "queued",
        error: null,
        resultBuffer: null,
        mimeType: null,
      })),
    });

    // Fire each model run independently (not allSettled — each is its own async)
    for (const modelId of targets) {
      processRun(jobId, modelId);
    }

    const baseUrl = `${req.protocol}://${req.get("host")}`;
    return res.status(202).json({ jobId, statusUrl: `${baseUrl}/api/jobs/${jobId}` });
  } catch (err) {
    console.error("🔥 Start job error:", err.message);
    res.status(500).json({ error: "Failed to start job", details: err.message });
  }
});

// ── POLL STATUS ──
app.get("/api/jobs/:jobId", (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: "Job not found or expired" });

  return res.json({
    jobId: job.jobId,
    runs: job.runs.map((r) => ({
      modelId: r.modelId,
      label: getModelById(r.modelId)?.label || r.modelId,
      status: r.status,
      step: r.step,
      error: r.error,
      hasImage: r.status === "done" && !!r.resultBuffer,
      durationMs: r.durationMs ?? null,
    })),
  });
});

// ── FETCH IMAGE (per model run) ──
app.get("/api/jobs/:jobId/image/:modelId", (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: "Job not found or expired" });

  const run = job.runs.find((r) => r.modelId === req.params.modelId);
  if (!run) return res.status(404).json({ error: "Model run not found" });
  if (run.status !== "done" || !run.resultBuffer) {
    return res.status(409).json({ error: "Not ready", status: run.status });
  }

  res.set({ "Content-Type": run.mimeType || "image/png", "Cache-Control": "no-store" });
  return res.send(run.resultBuffer);
});

// ── RETRY A SINGLE FAILED RUN ──
app.post("/api/jobs/:jobId/retry/:modelId", (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: "Job not found or expired" });

  const run = job.runs.find((r) => r.modelId === req.params.modelId);
  if (!run) return res.status(404).json({ error: "Model run not found" });

  if (run.status !== "error") {
    return res.status(400).json({ error: `Run is ${run.status}, not retryable` });
  }

  // Reset this run
  run.status = "queued";
  run.step = "queued";
  run.error = null;
  run.resultBuffer = null;
  run.mimeType = null;
  run.durationMs = null;
  job.updatedAt = Date.now();

  // Re-launch just this one run
  processRun(job.jobId, run.modelId);

  return res.json({ ok: true, message: `Retrying ${run.modelId}` });
});

// ───────────────── SINGLE RUN PROCESSOR ─────────────────
// Each run is independent. One failing does NOT affect others.

async function processRun(jobId, modelId) {
  activeRuns++;
  const started = Date.now();
  console.log(`  🚀 [${modelId}] Run started (active: ${activeRuns})`);

  const job = jobs.get(jobId);
  if (!job) { activeRuns--; return; }

  const model = getModelById(modelId);
  const run = job.runs.find((r) => r.modelId === modelId);
  if (!model || !run) { activeRuns--; return; }

  try {
    // ── GENERATE ──
    run.status = "processing";
    run.step = "generating";
    job.updatedAt = Date.now();

    console.log(`  📤 [${modelId}] Calling adapter...`);
    const avatarBuffer = await runAdapter(model, job.inputBuffer, job.inputMime, job.prompt);
    console.log(`  ✅ [${modelId}] Image generated (${((Date.now() - started) / 1000).toFixed(1)}s)`);

    // ── BRAND / COMPOSE ──
    run.step = "branding";
    job.updatedAt = Date.now();

    const finalImage = await compose5x7(avatarBuffer);
    console.log(`  🎨 [${modelId}] Composition done`);

    // ── DONE ──
    run.status = "done";
    run.step = "done";
    run.resultBuffer = finalImage;
    run.mimeType = "image/jpeg";
    run.error = null;
    job.updatedAt = Date.now();

    run.durationMs = Date.now() - started;
    console.log(`  🎉 [${modelId}] Complete in ${(run.durationMs / 1000).toFixed(1)}s`);

  } catch (err) {
    console.error(`  🔥 [${modelId}] Failed:`, err.message);
    run.status = "error";
    run.step = "error";
    run.error = err.message;
    job.updatedAt = Date.now();
    // Other runs keep going — this is fully isolated
  } finally {
    activeRuns = Math.max(0, activeRuns - 1);
    console.log(`  🧩 [${modelId}] Ended (active: ${activeRuns})`);
  }
}

// ───────────────── 5×7 COMPOSITION ─────────────────

// Footer is loaded once and reused for every print
let footerPromise = null;
function loadFooter() {
  footerPromise ??= sharp(FOOTER_PATH)
    .resize(OUT_W, FOOTER_H, { fit: "cover" })
    .png()
    .toBuffer()
    .catch((err) => {
      console.warn("⚠️ Footer not loaded:", err.message);
      footerPromise = null; // retry on next job
      return null;
    });
  return footerPromise;
}

async function compose5x7(avatarBuffer) {
  const mainH = OUT_H - FOOTER_H;

  const footer = await loadFooter();
  const bg = { r: 7, g: 7, b: 58 };

  // One pipeline: portrait → extend canvas down → footer on top → JPEG
  // (JPEG is ~6× smaller than PNG for a 5×7 print; mozjpeg skipped, it adds ~0.5s)
  return sharp(avatarBuffer)
    .resize(OUT_W, mainH, { fit: "cover", position: "centre" })
    .flatten({ background: bg })
    .extend({ bottom: FOOTER_H, background: bg })
    .composite(footer ? [{ input: footer, top: mainH, left: 0 }] : [])
    .jpeg({ quality: JPEG_QUALITY, chromaSubsampling: "4:4:4" })
    .toBuffer();
}

// ───────────────── START ─────────────────
app.listen(PORT, () => {
  console.log(`✅ API running on port ${PORT}`);
  console.log(`📦 Models loaded: ${MODELS.map((m) => m.id).join(", ")}`);
});