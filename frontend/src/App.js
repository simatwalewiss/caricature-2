import React, { useEffect, useRef, useState, useCallback } from "react";

// ═══════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════
const API_BASE = process.env.REACT_APP_API_BASE;
if (!API_BASE) {
  throw new Error("REACT_APP_API_BASE is not set (see .env.development / .env.production)");
}

const MIRROR_SELFIE_PREVIEW = true;
const COUNTDOWN_SECONDS = 3;
const POLL_INTERVAL = 1000;

// Uploads are downscaled to this long side before sending (models output ≤1024px)
const UPLOAD_MAX_SIDE = 1024;
const UPLOAD_JPEG_QUALITY = 0.9;

// Both models of a mode always run; the fallback is shown only if the primary fails.
// flux-2-pro stays registered on the backend for future use.
const SPEED_MODES = {
  best: { label: "✨ Best quality", hint: "Recommended", primary: "gpt-image-2", fallback: "gpt-image-1.5" },
  fast: { label: "⚡ Fast", hint: "Quicker result", primary: "gpt-image-1.5", fallback: "gpt-image-2" },
};
const DEFAULT_SPEED = "best";

const THEME_SUGGESTIONS = [
  { emoji: "🦸", label: "Superhero", prompt: "Superhero comic book style portrait, dynamic pose, cape flowing, bold colors" },
  { emoji: "🎨", label: "Pop Art", prompt: "Andy Warhol pop art style portrait, bold primary colors, halftone dots, retro" },
  { emoji: "🏛️", label: "Renaissance", prompt: "Renaissance oil painting portrait, classical style, dramatic lighting, ornate frame" },
  { emoji: "🤖", label: "Cyberpunk", prompt: "Cyberpunk neon portrait, futuristic city background, glowing circuits, holographic" },
  { emoji: "⚔️", label: "Medieval", prompt: "Medieval knight portrait, ornate armor, epic castle background, dramatic sky" },
  { emoji: "🚀", label: "Sci-Fi", prompt: "Sci-fi commander portrait, starship bridge, galactic background, futuristic uniform" },
  { emoji: "🎬", label: "Anime", prompt: "Japanese anime style portrait, vibrant colors, expressive eyes, dynamic background" },
  { emoji: "🎸", label: "Rockstar", prompt: "Rock and roll portrait, leather jacket, electric guitar, concert stage lights" },
];

// ═══════════════════════════════════════════
// STYLE
// ═══════════════════════════════════════════
const STYLE_ID = "rdd-caricature-v6";
function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = CSS;
  document.head.appendChild(el);
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');

/* Theme: indigo → violet → magenta with geometric pattern (public/theme-bg.jpg) */
:root {
  --accent: #8A2BFF; --accent-bright: #D23BFF; --accent-deep: #2A1AFF;
  --accent-rgb: 138,43,255;
  --accent-glow: rgba(138,43,255,0.30);
  --gradient: linear-gradient(135deg, var(--accent-deep) 0%, var(--accent) 55%, var(--accent-bright) 100%);
  --bg: #07073A; --card: rgba(10,8,58,0.78); --card-border: rgba(180,150,255,0.18);
  --surface: rgba(255,255,255,0.06); --text: #FFFFFF; --text-sec: #C9C3F5; --text-muted: #8E87C9;
  --radius: 16px; --radius-sm: 10px;
  --green: #22C55E; --yellow: #FFB020; --err: #FF5C8A;
}
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html { height: 100%; }
body {
  background: var(--bg); color: var(--text);
  font-family: 'Inter', 'Segoe UI', system-ui, sans-serif;
  -webkit-font-smoothing: antialiased; min-height: 100%;
}
#root { min-height: 100vh; }

.rdd-page {
  min-height: 100vh; display: flex; flex-direction: column;
  align-items: center; padding: 20px 16px 40px;
  position: relative; overflow: hidden;
}
/* Fixed layer instead of background-attachment: fixed (unsupported on iOS Safari) */
.rdd-bg {
  position: fixed; inset: 0; z-index: 0; pointer-events: none;
  background: url('/theme-bg.jpg') center / cover no-repeat, var(--bg);
}
.rdd-bg::after {
  content: ''; position: absolute; inset: 0;
  background: radial-gradient(ellipse at center, rgba(7,7,58,0.55) 0%, rgba(7,7,58,0.25) 70%);
}
.rdd-glow { position: fixed; border-radius: 50%; pointer-events: none; z-index: 0; filter: blur(100px); }
.rdd-glow--top { top: -220px; left: 50%; transform: translateX(-50%); width: 600px; height: 600px; background: var(--accent-glow); }
.rdd-glow--bottom { bottom: -220px; right: -120px; width: 500px; height: 500px; background: rgba(210,59,255,0.18); }

.rdd-header { text-align: center; margin-bottom: 20px; z-index: 1; animation: fadeDown 0.6s ease; }
.rdd-logo { font-size: 30px; font-weight: 300; letter-spacing: 2px; color: var(--text); line-height: 1.1; user-select: none; }
.rdd-logo .dot { color: var(--accent); font-weight: 700; font-size: 1.1em; }
.rdd-logo-sub { font-size: 12px; letter-spacing: 7px; color: var(--text-sec); margin-top: 1px; font-weight: 300; }
.rdd-tagline {
  margin-top: 10px; font-size: 11px; letter-spacing: 2px; text-transform: uppercase;
  color: var(--text-sec); font-weight: 600; text-shadow: 0 1px 8px rgba(7,7,58,0.9);
}

.rdd-card {
  width: 100%; max-width: 480px; background: var(--card);
  border: 1px solid var(--card-border); border-radius: var(--radius);
  padding: 28px 22px; position: relative; z-index: 1;
  box-shadow: 0 8px 40px rgba(4,2,40,0.6), 0 0 80px rgba(var(--accent-rgb),0.18);
  -webkit-backdrop-filter: blur(14px); backdrop-filter: blur(14px);
  animation: fadeUp 0.5s ease;
}
.rdd-card::before {
  content: ''; position: absolute; top: 0; left: 15%; right: 15%; height: 2px;
  background: linear-gradient(90deg, transparent, var(--accent-bright), transparent); border-radius: 2px;
}

.rdd-title {
  text-align: center; font-size: 22px; font-weight: 700; margin-bottom: 4px;
  background: linear-gradient(135deg, #fff 45%, var(--accent-bright));
  -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
}
.rdd-subtitle { text-align: center; font-size: 13px; color: var(--text-muted); margin-bottom: 20px; line-height: 1.5; }

.rdd-label {
  display: block; font-size: 11px; font-weight: 600; letter-spacing: 1px;
  text-transform: uppercase; color: var(--text-sec); margin-bottom: 8px; margin-top: 18px;
}
.rdd-label:first-of-type { margin-top: 0; }

.rdd-file-input {
  width: 100%; padding: 10px 12px; border-radius: var(--radius-sm);
  border: 1px dashed rgba(180,150,255,0.28); background: var(--surface);
  color: var(--text-sec); font-size: 13px; cursor: pointer; transition: border-color 0.2s; font-family: inherit;
}
.rdd-file-input:hover:not(:disabled) { border-color: var(--accent); }
.rdd-file-input:disabled { opacity: 0.4; cursor: not-allowed; }

.rdd-text-input {
  width: 100%; padding: 12px 14px; border-radius: var(--radius-sm);
  border: 1px solid rgba(180,150,255,0.22); background: var(--surface);
  color: var(--text); font-size: 14px; font-family: inherit; outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.rdd-text-input::placeholder { color: var(--text-muted); }
.rdd-text-input:focus { border-color: var(--accent-bright); box-shadow: 0 0 0 3px rgba(var(--accent-rgb),0.25); }
.rdd-text-input:disabled { opacity: 0.4; cursor: not-allowed; }

.rdd-themes { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.rdd-pill {
  padding: 6px 12px; border-radius: 20px; border: 1px solid rgba(180,150,255,0.22);
  background: var(--surface); color: var(--text-sec); font-size: 12px;
  font-family: inherit; cursor: pointer; transition: all 0.2s; white-space: nowrap;
}
.rdd-pill:hover:not(:disabled) { border-color: var(--accent-bright); color: var(--text); background: rgba(var(--accent-rgb),0.15); }
.rdd-pill.active { border-color: transparent; background: var(--gradient); color: var(--text); box-shadow: 0 2px 14px rgba(var(--accent-rgb),0.45); }
.rdd-pill:disabled { opacity: 0.3; cursor: not-allowed; }

.rdd-speed {
  display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 16px;
}
.rdd-speed .rdd-label { margin: 0; }
.rdd-speed-select {
  appearance: none; -webkit-appearance: none; color-scheme: dark;
  padding: 8px 34px 8px 12px; border-radius: var(--radius-sm);
  border: 1px solid rgba(180,150,255,0.28); color: var(--text);
  background: var(--surface) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' fill='none' stroke='%23C9C3F5' stroke-width='2'/%3E%3C/svg%3E") no-repeat right 12px center;
  font-family: inherit; font-size: 13px; font-weight: 500; cursor: pointer; outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.rdd-speed-select:focus-visible { border-color: var(--accent-bright); box-shadow: 0 0 0 3px rgba(var(--accent-rgb),0.25); }
.rdd-speed-select:disabled { opacity: 0.4; cursor: not-allowed; }
.rdd-speed-select option { background: #14123D; color: #fff; }

.rdd-consent { margin-top: 14px; }
.rdd-consent-row { display: flex; align-items: flex-start; gap: 10px; }
.rdd-consent-more {
  background: none; border: none; padding: 0; margin-left: 4px; font: inherit; font-size: 12px;
  color: var(--accent-bright); cursor: pointer; text-decoration: underline; text-underline-offset: 2px;
}
.rdd-consent-more:focus-visible { outline: 2px solid var(--accent-bright); outline-offset: 2px; border-radius: 3px; }
.rdd-consent-text {
  margin: 8px 0 0 28px; padding: 10px 12px; border-radius: var(--radius-sm);
  background: rgba(var(--accent-rgb),0.08); border: 1px solid rgba(180,150,255,0.18);
  font-size: 11.5px; line-height: 1.55; color: var(--text-sec); animation: fadeUp 0.2s ease;
}
.rdd-consent-check {
  display: flex; align-items: flex-start; gap: 10px;
  font-size: 12.5px; font-weight: 500; color: var(--text); cursor: pointer; line-height: 1.45;
}
.rdd-consent-check input {
  flex: none; width: 18px; height: 18px; margin-top: 1px;
  accent-color: var(--accent-bright); cursor: pointer;
}
.rdd-consent-check input:focus-visible { outline: 2px solid var(--accent-bright); outline-offset: 2px; }

.rdd-btn {
  width: 100%; padding: 14px 20px; border-radius: var(--radius-sm); font-size: 15px;
  font-weight: 600; font-family: inherit; cursor: pointer; transition: all 0.2s;
  border: none; margin-top: 12px; display: flex; align-items: center; justify-content: center; gap: 8px;
}
.rdd-btn-primary {
  background: var(--gradient);
  color: #fff; box-shadow: 0 4px 20px rgba(var(--accent-rgb),0.40);
}
.rdd-btn-primary:hover:not(:disabled) {
  background: var(--gradient); filter: brightness(1.12);
  box-shadow: 0 6px 30px rgba(210,59,255,0.55); transform: translateY(-1px);
}
.rdd-btn-primary:active:not(:disabled) { transform: translateY(0); }
.rdd-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; transform: none; box-shadow: none; }
.rdd-btn-secondary {
  background: transparent; color: var(--text-sec); border: 1px solid rgba(180,150,255,0.25);
}
.rdd-btn-secondary:hover:not(:disabled) { border-color: var(--accent-bright); color: var(--text); background: rgba(var(--accent-rgb),0.10); }
.rdd-btn-secondary:disabled { opacity: 0.4; cursor: not-allowed; }

.rdd-preview { margin-top: 10px; }
.rdd-preview-label { font-size: 11px; color: var(--text-muted); margin-bottom: 6px; }
.rdd-preview img { width: 100%; display: block; border-radius: var(--radius-sm); border: 1px solid var(--card-border); }

.rdd-video { width: 100%; display: block; border-radius: var(--radius-sm); border: 1px solid var(--card-border); background: #000; }
.rdd-camera { position: relative; margin-top: 10px; }
.rdd-countdown {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  border-radius: var(--radius-sm); background: rgba(7,7,58,0.25); pointer-events: none;
}
.rdd-countdown span {
  font-size: 120px; font-weight: 800; line-height: 1; color: #fff;
  text-shadow: 0 0 30px rgba(210,59,255,0.9), 0 0 60px rgba(42,26,255,0.7), 0 4px 12px rgba(0,0,0,0.5);
  animation: countPop 1s ease-out;
}
@keyframes countPop {
  0% { opacity: 0; transform: scale(1.8); }
  25% { opacity: 1; transform: scale(1); }
  85% { opacity: 1; }
  100% { opacity: 0.2; transform: scale(0.9); }
}
@media (prefers-reduced-motion: reduce) { .rdd-countdown span { animation: none; } }
.rdd-preview .rdd-btn { margin-top: 8px; }

.rdd-or {
  display: flex; align-items: center; gap: 10px; margin: 12px 0 4px;
  color: var(--text-muted); font-size: 11px; text-transform: uppercase; letter-spacing: 1px;
}
.rdd-or::before, .rdd-or::after { content: ''; flex: 1; height: 1px; background: rgba(180,150,255,0.15); }

/* ===== PROGRESS ===== */
.rdd-progress {
  margin-top: 16px; padding: 24px 16px; border-radius: var(--radius-sm);
  background: var(--surface); border: 1px solid var(--card-border);
  animation: fadeUp 0.3s ease; text-align: center;
}
.rdd-spinner {
  width: 36px; height: 36px; border: 3px solid rgba(255,255,255,0.08);
  border-top-color: var(--accent-bright); border-right-color: var(--accent-deep); border-radius: 50%;
  animation: spin 0.7s linear infinite; margin: 0 auto 14px;
}
.rdd-progress-title { font-weight: 600; font-size: 15px; margin-bottom: 4px; }
.rdd-progress-sub { font-size: 12px; color: var(--text-muted); line-height: 1.5; }
.rdd-progress-debug { margin-top: 10px; font-size: 10px; color: var(--text-muted); opacity: 0.4; }

/* ===== RESULT ===== */
.rdd-result { animation: fadeUp 0.5s ease; }
.rdd-result-img {
  width: 100%; border-radius: var(--radius-sm);
  border: 1px solid rgba(var(--accent-rgb),0.35);
  box-shadow: 0 8px 40px rgba(var(--accent-rgb),0.35);
  display: block; transition: opacity 0.4s;
}
.rdd-result-actions { display: flex; flex-direction: column; gap: 8px; margin-top: 16px; }

.rdd-error {
  margin-top: 14px; padding: 12px 14px; background: rgba(255,92,138,0.10);
  border: 1px solid rgba(255,92,138,0.30); border-radius: var(--radius-sm);
  color: var(--err); font-size: 13px; line-height: 1.5;
}
.rdd-error-detail { font-size: 11px; margin-top: 6px; opacity: 0.7; }

.rdd-footer { text-align: center; margin-top: 24px; z-index: 1; }
.rdd-footer-line { font-size: 11px; color: var(--text-sec); letter-spacing: 0.5px; text-shadow: 0 1px 8px rgba(7,7,58,0.9); }
.rdd-footer-tags { font-size: 11px; color: var(--accent-bright); font-weight: 600; margin-top: 4px; letter-spacing: 0.5px; text-shadow: 0 1px 8px rgba(7,7,58,0.9); }

.rdd-logo-img {
  height: 50px;
  width: auto;
  display: block;
  margin: 0 auto 6px;
  object-fit: contain;
  /* GIF has a black background; screen blending drops it over the pattern */
  mix-blend-mode: screen;
}

@media (min-width: 768px) {
  .rdd-logo-img { height: 60px; }
}
@media (min-width: 1024px) {
  .rdd-logo-img { height: 70px; }
}

@keyframes spin { to { transform: rotate(360deg); } }
@keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
@keyframes fadeDown { from { opacity: 0; transform: translateY(-12px); } to { opacity: 1; transform: translateY(0); } }

@media (max-width: 520px) {
  .rdd-page { padding: 16px 10px 32px; }
  .rdd-card { padding: 22px 16px; border-radius: 14px; }
  .rdd-title { font-size: 20px; }
  .rdd-logo { font-size: 26px; }
  .rdd-btn { padding: 16px; font-size: 16px; }
  .rdd-text-input { padding: 14px; font-size: 16px; }
  .rdd-themes { gap: 6px; }
  .rdd-pill { font-size: 11px; padding: 5px 10px; }
}
@media (min-width: 768px) {
  .rdd-page { padding: 32px 24px 48px; }
  .rdd-card { max-width: 500px; padding: 32px 28px; }
  .rdd-title { font-size: 26px; }
  .rdd-result-actions { flex-direction: row; }
  .rdd-result-actions .rdd-btn { flex: 1; }
}
@media (min-width: 1024px) {
  .rdd-card { max-width: 520px; padding: 36px 32px; }
  .rdd-logo { font-size: 34px; }
}
`;

// ═══════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════
export default function App() {
  useEffect(() => {
    injectStyles();
  }, []);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  // Models (loaded but hidden from user)
  const [models, setModels] = useState([]);
  const [speed, setSpeed] = useState(DEFAULT_SPEED);
  const [consent, setConsent] = useState(false);
  const [countdown, setCountdown] = useState(null);
  const [photoSource, setPhotoSource] = useState(null); // "camera" | "upload"
  const countdownTimerRef = useRef(null);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const { primary: PRIMARY_MODEL, fallback: FALLBACK_MODEL } = SPEED_MODES[speed];

  // Inputs
  const [cameraOn, setCameraOn] = useState(false);
  const [mediaStream, setMediaStream] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState(null);
  const [prompt, setPrompt] = useState("");
  const [selectedTheme, setSelectedTheme] = useState(null);

  // Job
  const [jobId, setJobId] = useState(null);
  const [error, setError] = useState(null);

  // Per-model run state: { [modelId]: { status, step, label, error, url, imgReady } }
  const [runStates, setRunStates] = useState({});

  const pollTimerRef = useRef(null);
  const downloadedRef = useRef(new Set());

  // Derived state
  const primary = runStates[PRIMARY_MODEL];
  const fallback = runStates[FALLBACK_MODEL];

  const primaryDone = primary?.status === "done" && primary?.url;
  const primaryFailed = primary?.status === "error";
  const fallbackDone = fallback?.status === "done" && fallback?.url;
  const fallbackFailed = fallback?.status === "error";
  const bothFailed = primaryFailed && fallbackFailed;

  const winner =
    primaryDone
      ? primary
      : primaryFailed && fallbackDone
      ? fallback
      : null;

  const winnerModelId =
    primaryDone
      ? PRIMARY_MODEL
      : primaryFailed && fallbackDone
      ? FALLBACK_MODEL
      : null;

  const stillLoading =
    Object.keys(runStates).length > 0 && !winner && !bothFailed;
  const hasResult = !!winner;
  const isBusy = stillLoading;
  const showForm = !hasResult && !stillLoading && !bothFailed;

  // ── Load models (silent — user never sees) ──
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/models`);
        const list = await res.json();
        setModels(list);
      } catch {
        setModels([]);
      }
    })();
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      Object.values(runStates).forEach((r) => r.url && URL.revokeObjectURL(r.url));
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (cameraOn && videoRef.current && mediaStream)
      videoRef.current.srcObject = mediaStream;
  }, [cameraOn, mediaStream]);

  // ── Camera ──
  const startCamera = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
      setMediaStream(stream);
      setCameraOn(true);
    } catch {
      setError("Camera access denied or unavailable.");
    }
  };

  const cancelCountdown = () => {
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    countdownTimerRef.current = null;
    setCountdown(null);
  };

  const stopCamera = () => {
    cancelCountdown();
    mediaStream?.getTracks().forEach((t) => t.stop());
    setMediaStream(null);
    setCameraOn(false);
  };

  // 3-2-1 then capture
  const startCountdown = () => {
    if (countdownTimerRef.current) return;
    let n = COUNTDOWN_SECONDS;
    setCountdown(n);
    countdownTimerRef.current = setInterval(() => {
      n -= 1;
      if (n > 0) {
        setCountdown(n);
      } else {
        cancelCountdown();
        capturePhoto();
      }
    }, 1000);
  };

  const retakePhoto = () => {
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setImagePreviewUrl(null);
    setImageFile(null);
    setPhotoSource(null);
    startCamera();
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) return;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (MIRROR_SELFIE_PREVIEW) {
      ctx.save();
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, w, h);
      ctx.restore();
    } else {
      ctx.drawImage(video, 0, 0, w, h);
    }
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        setImageFile(new File([blob], "photo.jpg", { type: "image/jpeg" }));
        setPhotoSource("camera");
        if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
        setImagePreviewUrl(URL.createObjectURL(blob));
        stopCamera();
      },
      "image/jpeg",
      0.92
    );
  };

  // ── Theme pills ──
  const selectTheme = (t) => {
    if (isBusy) return;
    if (selectedTheme === t.label) {
      setSelectedTheme(null);
      setPrompt("");
    } else {
      setSelectedTheme(t.label);
      setPrompt(t.prompt);
    }
  };

  // ── Download a single model's image ──
  const downloadRunImage = useCallback(async (jid, modelId) => {
    try {
      const res = await fetch(`${API_BASE}/api/jobs/${jid}/image/${modelId}`);
      if (!res.ok) throw new Error(`Image fetch failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setRunStates((prev) => ({
        ...prev,
        [modelId]: { ...prev[modelId], url, imgReady: false },
      }));
    } catch (e) {
      console.warn(`Download failed for ${modelId}:`, e.message);
    }
  }, []);

  // ── Polling ──
  const beginPolling = useCallback(
    (jid) => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      downloadedRef.current = new Set();

      pollTimerRef.current = setInterval(async () => {
        try {
          const res = await fetch(`${API_BASE}/api/jobs/${jid}`);
          if (!res.ok) return;
          const data = await res.json();

          const newStates = {};
          let allDone = true;

          for (const run of data.runs || []) {
            const prev = {};
            setRunStates((p) => {
              Object.assign(prev, p);
              return p;
            });

            newStates[run.modelId] = {
              ...(prev[run.modelId] || {}),
              status: run.status,
              step: run.step,
              label: run.label,
              error: run.error,
            };

            if (run.hasImage && !downloadedRef.current.has(run.modelId)) {
              downloadedRef.current.add(run.modelId);
              downloadRunImage(jid, run.modelId);
            }

            if (run.status !== "done" && run.status !== "error") {
              allDone = false;
            }
          }

          setRunStates((prev) => {
            const merged = { ...prev };
            for (const [k, v] of Object.entries(newStates)) {
              merged[k] = { ...merged[k], ...v };
            }
            return merged;
          });

          if (allDone) {
            clearInterval(pollTimerRef.current);
            pollTimerRef.current = null;
          }
        } catch (e) {
          console.warn("Poll error:", e.message);
        }
      }, POLL_INTERVAL);
    },
    [downloadRunImage]
  );

  // ── Start job ──
  const startJob = async () => {
    setError(null);
    setRunStates({});
    setJobId(null);

    if (!imageFile || !prompt.trim()) {
      setError("Please select or capture a photo and choose a style.");
      return;
    }
    if (!consent) {
      setError("Please read the photo notice and tick the box to continue.");
      return;
    }

    try {
      if (mediaStream) stopCamera();

      const modelIds = [PRIMARY_MODEL, FALLBACK_MODEL];

      // Initialize run states for both hidden models
      const initStates = {};
      for (const mid of modelIds) {
        initStates[mid] = {
          status: "queued",
          step: "queued",
          label: mid,
          error: null,
          url: null,
          imgReady: false,
        };
      }
      setRunStates(initStates);

      const upload = await shrinkImage(imageFile);

      const fd = new FormData();
      fd.append("image", upload);
      fd.append("prompt", prompt.trim());
      fd.append("modelIds", JSON.stringify(modelIds));

      const res = await fetch(`${API_BASE}/api/generate-image`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok)
        throw new Error(
          `Request failed (${res.status}): ${await safeText(res)}`
        );
      const data = await res.json();
      setJobId(data.jobId);
      beginPolling(data.jobId);
    } catch (e) {
      setError(e.message || "Failed to start generation");
      setRunStates({});
    }
  };

  // ── Mark image rendered ──
  const markReady = (modelId) => {
    setRunStates((prev) => ({
      ...prev,
      [modelId]: { ...prev[modelId], imgReady: true },
    }));
  };

  // ── Print ──
  const printImage = (url) => {
    if (!url) return;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(
      `<html><head><title>Print</title>
      <style>@page{size:127mm 178mm;margin:0}html,body{margin:0;padding:0;width:127mm;height:178mm}
      img{width:127mm;height:178mm;object-fit:cover;display:block}</style></head>
      <body><img src="${url}"/>
      <script>window.onload=()=>{window.focus();window.print()}<\/script></body></html>`
    );
    w.document.close();
  };

  // ── Reset ──
  const reset = () => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    Object.values(runStates).forEach((r) => r.url && URL.revokeObjectURL(r.url));
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    downloadedRef.current = new Set();
    setImageFile(null);
    setImagePreviewUrl(null);
    setPrompt("");
    setSelectedTheme(null);
    setSpeed(DEFAULT_SPEED);
    setConsent(false);
    setShowPrivacy(false);
    setPhotoSource(null);
    cancelCountdown();
    setJobId(null);
    setError(null);
    setRunStates({});
  };

  // ═══════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════
  return (
    <div className="rdd-page">
      <div className="rdd-bg" />
      <div className="rdd-glow rdd-glow--top" />
      <div className="rdd-glow rdd-glow--bottom" />

      {/* HEADER */}
      <header className="rdd-header">
  <img
    src="/logo.gif"
    alt="Red Dot Distribution"
    className="rdd-logo-img"
  />
  <div className="rdd-tagline">To A Future Without Limits</div>
</header>

      {/* CARD */}
      <div className="rdd-card">
        <div className="rdd-title">Copilot Caricature Booth</div>
        <div className="rdd-subtitle">
          Snap a photo · Pick a style · Get your AI caricature
        </div>

        {/* ═══ FORM ═══ */}
        {showForm && (
          <>
            <label className="rdd-label">📸 Your Photo</label>

            {!cameraOn && (
              <>
                <input
                  type="file"
                  accept="image/*"
                  className="rdd-file-input"
                  disabled={isBusy}
                  onChange={(e) => {
                    const f = e.target.files?.[0] || null;
                    setImageFile(f);
                    setPhotoSource(f ? "upload" : null);
                    setError(null);
                    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
                    setImagePreviewUrl(f ? URL.createObjectURL(f) : null);
                  }}
                />
                <div className="rdd-or">
                  <span>or</span>
                </div>
                <button
                  className="rdd-btn rdd-btn-secondary"
                  onClick={startCamera}
                  disabled={isBusy}
                  style={{ marginTop: 0 }}
                >
                  📷 Use Camera
                </button>
                {imagePreviewUrl && (
                  <div className="rdd-preview">
                    <p className="rdd-preview-label">Preview:</p>
                    <img src={imagePreviewUrl} alt="Preview" />
                    {photoSource === "camera" && (
                      <button
                        className="rdd-btn rdd-btn-secondary"
                        onClick={retakePhoto}
                        disabled={isBusy}
                      >
                        🔄 Retake Photo
                      </button>
                    )}
                  </div>
                )}
              </>
            )}

            {cameraOn && (
              <>
                <div className="rdd-camera">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    className="rdd-video"
                    style={{
                      transform: MIRROR_SELFIE_PREVIEW ? "scaleX(-1)" : "none",
                    }}
                  />
                  {countdown !== null && (
                    <div className="rdd-countdown" aria-live="assertive">
                      <span key={countdown}>{countdown}</span>
                    </div>
                  )}
                </div>
                <canvas ref={canvasRef} style={{ display: "none" }} />
                <button
                  className="rdd-btn rdd-btn-primary"
                  onClick={startCountdown}
                  disabled={countdown !== null}
                >
                  {countdown !== null ? "😊 Get ready…" : "📸 Take Photo"}
                </button>
                <button
                  className="rdd-btn rdd-btn-secondary"
                  onClick={stopCamera}
                >
                  Cancel
                </button>
              </>
            )}

            <label className="rdd-label">🎨 Pick a Style</label>
            <div className="rdd-themes">
              {THEME_SUGGESTIONS.map((t) => (
                <button
                  key={t.label}
                  className={`rdd-pill${selectedTheme === t.label ? " active" : ""}`}
                  onClick={() => selectTheme(t)}
                  disabled={isBusy}
                >
                  {t.emoji} {t.label}
                </button>
              ))}
            </div>

            <label className="rdd-label">✏️ Or Describe Your Style</label>
            <input
              type="text"
              className="rdd-text-input"
              placeholder='"Astronaut on Mars" or "Watercolor painting"'
              value={prompt}
              disabled={isBusy}
              onChange={(e) => {
                setPrompt(e.target.value);
                setSelectedTheme(null);
              }}
            />

            {/* Speed picks which model is primary; model names stay hidden */}
            <div className="rdd-speed">
              <label className="rdd-label" htmlFor="speed-select">⏱️ Speed</label>
              <select
                id="speed-select"
                className="rdd-speed-select"
                value={speed}
                disabled={isBusy}
                onChange={(e) => setSpeed(e.target.value)}
              >
                {Object.entries(SPEED_MODES).map(([key, m]) => (
                  <option key={key} value={key}>
                    {m.label} · {m.hint}
                  </option>
                ))}
              </select>
            </div>

            <div className="rdd-consent">
              <div className="rdd-consent-row">
                <label className="rdd-consent-check">
                  <input
                    type="checkbox"
                    id="photo-consent"
                    checked={consent}
                    disabled={isBusy}
                    onChange={(e) => {
                      setConsent(e.target.checked);
                      setError(null);
                    }}
                  />
                  <span>
                    I agree to have my photo processed to create my caricature.
                    <button
                      type="button"
                      className="rdd-consent-more"
                      aria-expanded={showPrivacy}
                      aria-controls="privacy-details"
                      onClick={(e) => {
                        e.preventDefault();
                        setShowPrivacy((v) => !v);
                      }}
                    >
                      {showPrivacy ? "Hide details" : "Privacy details"}
                    </button>
                  </span>
                </label>
              </div>
              {showPrivacy && (
                <p className="rdd-consent-text" id="privacy-details">
                  🔒 Your photo is processed securely by Microsoft Azure AI to
                  create your caricature and is not used to train AI models. We
                  do not keep your photo: it is automatically deleted from our
                  system within 20 minutes. Please ask a member of our team if
                  you have any questions.
                </p>
              )}
            </div>

            <button
              className="rdd-btn rdd-btn-primary"
              onClick={startJob}
              disabled={isBusy || !consent}
            >
              🚀 Generate Caricature
            </button>
          </>
        )}

        {/* Global error (only for startup errors) */}
        {error && !bothFailed && (
          <div className="rdd-error">
            <strong>⚠️</strong> {error}
          </div>
        )}

        {/* ═══ LOADING STATE ═══ */}
        {stillLoading && (
          <div className="rdd-progress">
            <div className="rdd-spinner" />
            <div className="rdd-progress-title">Creating your caricature…</div>
            <div className="rdd-progress-sub">
              This may take 15–60 seconds. Don't close this page.
            </div>
            <div className="rdd-progress-debug">
              {primary?.step && !primaryFailed && `Processing…`}
              {primaryFailed && fallback?.step && "Switching to backup model…"}
            </div>
          </div>
        )}

        {/* ═══ WINNER IMAGE ═══ */}
        {winner && (
          <div className="rdd-result">
            <img
              src={winner.url}
              alt="Your Caricature"
              className="rdd-result-img"
              onLoad={() => markReady(winnerModelId)}
              style={{ opacity: winner.imgReady ? 1 : 0 }}
            />
            {winner.imgReady && (
              <div className="rdd-result-actions">
                <button
                  className="rdd-btn rdd-btn-primary"
                  onClick={() => printImage(winner.url)}
                >
                  🖨️ Print
                </button>
                <button className="rdd-btn rdd-btn-secondary" onClick={reset}>
                  🔄 Start Over
                </button>
              </div>
            )}
          </div>
        )}

        {/* ═══ BOTH FAILED ═══ */}
        {bothFailed && (
          <div>
            <div className="rdd-error">
              <strong>⚠️</strong> Generation failed. Please try again.
              <div className="rdd-error-detail">
                {primary?.error || fallback?.error}
              </div>
            </div>
            <button
              className="rdd-btn rdd-btn-secondary"
              onClick={reset}
              style={{ marginTop: 12 }}
            >
              🔄 Try Again
            </button>
          </div>
        )}
      </div>

      {/* FOOTER */}
      <footer className="rdd-footer">
        <div className="rdd-footer-line">
          Powered by Microsoft Azure AI & Copilot
        </div>
        <div className="rdd-footer-tags">
          #LimitlessPossibilities #Techquity
        </div>
      </footer>
    </div>
  );
}

// Downscale + re-encode as JPEG so uploads stay small; falls back to the original file.
async function shrinkImage(file) {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, UPLOAD_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d").drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", UPLOAD_JPEG_QUALITY)
    );
    if (!blob) return file;
    return new File([blob], "photo.jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

async function safeText(res) {
  try {
    return await res.text();
  } catch {
    return "";
  }
}