// ═══════════════════════════════════════════════════════════════
// adapters.js — Model registry + provider adapters
// ─────────────────────────────────────────────────────────────
// TO ADD A NEW MODEL:
//   1. Add an entry to MODELS[]
//   2. If it uses a new provider type, add an adapter function
//   3. Register the adapter in ADAPTERS{}
//   That's it. No changes to app.js or frontend needed.
// ═══════════════════════════════════════════════════════════════

import fetch from "node-fetch";
import FormData from "form-data";
function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable: ${name}`);
  return v;
}

// ───────────────────────── MODEL REGISTRY ─────────────────────────
// Each model needs:  id, label, type, + type-specific config
// ──────────────────────────────────────────────────────────────────

export const MODELS = [
  {
    id: "flux-2-pro",
    label: "FLUX.2 Pro",
    description: "Fast generation, strong identity preservation",
    type: "bfl",
    // BFL provider config
    url: required("FLUX_URL"),
    apiKey: required("FLUX_API_KEY"),
    model: "FLUX.2-pro",
    defaultSize: "1024x1024",
    outputFormat: "png",
  },
  {
    id: "gpt-image-2",
    label: "GPT-Image-2",
    description: "High quality, creative stylization (slower)",
    type: "azure_openai_images",
    // Azure OpenAI config
    endpoint: required("AOAI_ENDPOINT"),
    apiKey: required("AOAI_API_KEY"),
    deployment: "gpt-image-2",
    apiVersion: "2025-04-01-preview",
    defaultSize: "832x832",
    quality: "low",
  },
  {
    id: "gpt-image-1.5",
    label: "GPT-Image-1.5",
    description: "Balanced quality & speed, image editing",
    type: "azure_openai_images_bearer",
    endpoint: required("AOAI_ENDPOINT"),
    apiKey: required("AOAI_API_KEY"),
    deployment: "gpt-image-1.5",
    apiVersion: "2025-04-01-preview",
    defaultSize: "1024x1024",
  },

  // ── EXAMPLE: adding a third model (uncomment when ready) ──
  // {
  //   id: "flux-1-schnell",
  //   label: "FLUX.1 Schnell",
  //   description: "Ultra-fast drafts",
  //   type: "bfl",
  //   url: "https://YOUR-RESOURCE.services.ai.azure.com/providers/blackforestlabs/v1/flux-1-schnell?api-version=preview",
  //   apiKey: "YOUR_KEY",
  //   model: "FLUX.1-schnell",
  //   defaultSize: "1024x1024",
  //   outputFormat: "png",
  // },
];

// ───────────────────────── SYSTEM PROMPT ─────────────────────────

const SYSTEM_PROMPT = `
═══════════════════════════════════════════════════════════════
IMAGE EDITING TASK — CARTOON CARICATURE GENERATION
═══════════════════════════════════════════════════════════════

CORE RULE:
This is an IMAGE-TO-IMAGE TRANSFORMATION.
The input photo is the PRIMARY SOURCE OF TRUTH.

═══════════════════════════════════════════════════════════════
OUTPUT TYPE — STRICT REQUIREMENT
═══════════════════════════════════════════════════════════════

The output MUST be:
- A CARTOON or CARICATURE
- Fully illustrated / animated style
- NOT realistic
- NOT photorealistic
- NOT a filtered photo

If the result looks like a real photo → the task is FAILED.

Required visual traits:
- Bold black linework or clean ink outlines
- Stylised proportions (slightly larger head is OK)
- Cel shading OR painterly cartoon shading
- Fully illustrated background (not plain, not blurred photo)

═══════════════════════════════════════════════════════════════
IDENTITY PRESERVATION — ABSOLUTE PRIORITY
═══════════════════════════════════════════════════════════════

Preserve EXACTLY:
- Same person
- Same face shape and proportions
- Same gender presentation
- Same age appearance
- Same ethnicity
- Same hairstyle and hair texture

STRICT RULES:
- Do NOT change facial geometry
- Do NOT change identity
- Do NOT "beautify" or standardise features
- Do NOT reimagine the person

Caricature exaggeration must enhance personality,
NOT distort identity.

═══════════════════════════════════════════════════════════════
SKIN TONE HANDLING — CRITICAL
═══════════════════════════════════════════════════════════════

Skin tone must be preserved EXACTLY.

- Do NOT lighten or darken the skin
- Do NOT shift ethnicity
- Do NOT apply stylistic palettes that override skin colour

Lighting can enhance the skin tone — never replace it.

The art style is applied ON TOP of the real skin tone.

═══════════════════════════════════════════════════════════════
ACCESSORY & CLEANUP RULES
═══════════════════════════════════════════════════════════════

REMOVE:
- Headphones
- Glasses
- Hats
- Jewelry
- Lanyards, badges, headsets

UNLESS explicitly requested.

Do NOT add random props.

═══════════════════════════════════════════════════════════════
STYLE APPLICATION LOGIC
═══════════════════════════════════════════════════════════════

You will receive structured style guidance including:
- ART STYLE (e.g., Anime, Cyberpunk, Renaissance)
- SKIN DESCRIPTION (exact tone guidance)
- LIGHTING INSTRUCTIONS
- ARTIST REFERENCE

You MUST:
- Follow the artist/style closely
- Apply correct lighting for the skin tone
- Maintain strong stylistic consistency

═══════════════════════════════════════════════════════════════
CARICATURE ENFORCEMENT
═══════════════════════════════════════════════════════════════

The result MUST include:
- Expressive exaggerated features
- Personality-driven expression
- Stylised shapes

NOT:
- Flat realism
- Soft AI-photo look
- Generic portrait

═══════════════════════════════════════════════════════════════
FINAL VALIDATION CHECK (MANDATORY)
═══════════════════════════════════════════════════════════════

Before finishing, ensure:
✔ The person is clearly recognisable  
✔ The skin tone is unchanged  
✔ The output is clearly a cartoon/caricature  
✔ The image is NOT photorealistic  

If any of the above fail → regenerate properly.
`.trim();

// const SYSTEM_PROMPT = `
// ═══════════════════════════════════════════════════════════════
// IMAGE EDITING TASK — CARTOON CARICATURE PORTRAIT
// ═══════════════════════════════════════════════════════════════

// OUTPUT FORMAT — NON-NEGOTIABLE:
// This is an ANIMATED CARTOON CARICATURE. NOT a photograph. NOT a realistic render.
// NOT a photo filter. NOT a digital painting that looks like a photo.
// The output MUST look like a frame from an animated film or a high-quality
// illustrated character card.

// CARICATURE RULES:
// - Faces and features must be EXAGGERATED in the caricature tradition:
//   enlarged expressive eyes, prominent nose and chin, oversized smile or
//   expression that captures personality and charm.
// - Bodies may be stylised: slightly larger head, simplified limbs,
//   dynamic pose — in the tradition of the chosen art style.
// - Line work must be BOLD and CLEAN — thick ink outlines, confident strokes,
//   cel-shading or flat colour fills.
// - The background must be fully illustrated / painted in the art style,
//   not a plain backdrop and not a photograph.

// ═══════════════════════════════════════════════════════════════
// IDENTITY PRESERVATION — ABSOLUTE PRIORITY:
// ═══════════════════════════════════════════════════════════════

// The input photo is the PRIMARY SOURCE OF TRUTH.

// PRESERVE EXACTLY:
// - Same person, same face shape, same facial structure
// - Same gender presentation, same age appearance
// - Same ethnicity, same skin tone (NEVER lighten or darken)
// - Same hairstyle, same hair texture
// - Same body proportions (stylised, not altered)

// Do NOT reimagine the person.
// Do NOT change facial geometry.
// Do NOT swap or guess ethnicity.
// Only apply artistic CARTOON stylisation ON TOP of the real identity.

// ACCESSORY RULES:
// - REMOVE all accessories found in the input photo (headphones, hats,
//   glasses, jewelry, headsets, masks, lanyards, badges)
//   UNLESS the user explicitly requests a specific accessory.
// - Do NOT add props or items not requested.
// - Clothing may be adapted to fit the art style / theme.

// ═══════════════════════════════════════════════════════════════
// SKIN TONE — ZERO TOLERANCE FOR ALTERATION:
// ═══════════════════════════════════════════════════════════════

// The subject's skin colour is sacred. It must be faithfully preserved
// in the cartoon rendering. The art style is applied ON TOP of the real
// skin colour — it NEVER replaces, lightens, or darkens it.
// Lighting and shading enhance the skin tone, they do not change it.
// `.trim();

function buildPrompt(userPrompt) {
  const clean = String(userPrompt)
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 400);
  return `${SYSTEM_PROMPT}\n\nUSER THEME (apply as style/theme only): ${clean}`;
}



// ───────────────────────── ADAPTERS ─────────────────────────
// Each adapter: async (modelConfig, inputBuffer, inputMime, userPrompt) => Buffer

async function adapterBfl(model, inputBuffer, _inputMime, userPrompt) {
  const prompt = buildPrompt(userPrompt);
  const sizeMatch = model.defaultSize?.match(/^(\d+)x(\d+)$/);
  const width = sizeMatch ? Number(sizeMatch[1]) : 1024;
  const height = sizeMatch ? Number(sizeMatch[2]) : 1024;

  const payload = {
    model: model.model,
    prompt,
    width,
    height,
    output_format: model.outputFormat || "png",
    num_images: 1,
    input_image: inputBuffer.toString("base64"),
  };

  const resp = await fetch(model.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${model.apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(`FLUX API ${resp.status}: ${errText}`);
  }

  const result = await resp.json();

  // Robust extraction: base64 or URL
  if (result?.data?.[0]?.b64_json)
    return Buffer.from(result.data[0].b64_json, "base64");
  if (result?.b64_json)
    return Buffer.from(result.b64_json, "base64");
  if (result?.image_base64)
    return Buffer.from(result.image_base64, "base64");

  const urlCandidate =
    result?.data?.[0]?.url ||
    result?.result?.sample ||
    result?.result?.url ||
    result?.url;

  if (urlCandidate) {
    const dl = await fetch(urlCandidate);
    if (!dl.ok) throw new Error(`Image download failed: ${dl.status}`);
    return Buffer.from(await dl.arrayBuffer());
  }

  throw new Error(
    `FLUX response missing image data. Keys: ${Object.keys(result || {}).join(", ")}`
  );
}

async function adapterAzureOpenAIImages(model, inputBuffer, inputMime, userPrompt) {
  const prompt = buildPrompt(userPrompt);
  const url =
    `${model.endpoint}/deployments/${model.deployment}` +
    `/images/edits?api-version=${model.apiVersion}`;

  const form = new FormData();
  form.append("image[]", inputBuffer, {
    filename: "input.jpg",
    contentType: inputMime || "image/jpeg",
  });
  form.append("prompt", prompt);
  form.append("n", "1");
  form.append("size", model.defaultSize || "1024x1024");
  form.append("quality", model.quality || "high");

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "api-key": model.apiKey,
      ...form.getHeaders(),
    },
    body: form,
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(`Azure OpenAI Images ${resp.status}: ${errText}`);
  }

  const result = await resp.json();
  const b64 = result?.data?.[0]?.b64_json;
  if (!b64) throw new Error("No b64_json in Azure OpenAI response");
  return Buffer.from(b64, "base64");
}

async function adapterAzureOpenAIImagesBearer(model, inputBuffer, inputMime, userPrompt) {
  const prompt = buildPrompt(userPrompt);
  const url =
    `${model.endpoint}/deployments/${model.deployment}` +
    `/images/edits?api-version=${model.apiVersion}`;

  const form = new FormData();
  // gpt-image-1.5 uses "image" (no brackets), unlike gpt-image-2's "image[]"
  form.append("image", inputBuffer, {
    filename: "input.png",
    contentType: inputMime || "image/png",
  });
  form.append("prompt", prompt);
  form.append("n", "1");
  form.append("size", model.defaultSize || "1024x1024");

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      // This endpoint uses Bearer auth, not api-key header
      Authorization: `Bearer ${model.apiKey}`,
      ...form.getHeaders(),
    },
    body: form,
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(`Azure OpenAI Images (Bearer) ${resp.status}: ${errText}`);
  }

  const result = await resp.json();
  const b64 = result?.data?.[0]?.b64_json;
  if (!b64) throw new Error("No b64_json in gpt-image-1.5 response");
  return Buffer.from(b64, "base64");
}

// ───────────────────────── ADAPTER MAP ─────────────────────────
const ADAPTERS = {
  bfl: adapterBfl,
  azure_openai_images: adapterAzureOpenAIImages,
  azure_openai_images_bearer: adapterAzureOpenAIImagesBearer,
};

// ───────────────────────── PUBLIC API ─────────────────────────

/**
 * Run the right adapter for a given model config.
 * Returns a raw PNG/JPEG Buffer of the AI-generated image.
 */
export async function runAdapter(model, inputBuffer, inputMime, userPrompt) {
  const fn = ADAPTERS[model.type];
  if (!fn) throw new Error(`No adapter for model type: "${model.type}"`);
  return fn(model, inputBuffer, inputMime, userPrompt);
}

/**
 * Return the public (safe) model list for the frontend.
 */
export function getPublicModels() {
  return MODELS.map((m) => ({
    id: m.id,
    label: m.label,
    description: m.description || "",
  }));
}

/**
 * Find a model config by id.
 */
export function getModelById(id) {
  return MODELS.find((m) => m.id === id) || null;
}