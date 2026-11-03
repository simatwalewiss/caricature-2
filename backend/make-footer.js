// make-footer.js — run locally (`npm run footer`), commit assets/footer-theme.png.
// Pre-rendered because the Linux App Service has no Segoe UI font for SVG text.
// Re-run after changing the theme background, logos or footer text.
import sharp from "sharp";

const OUT_W = 1270;
const FOOTER_H = 240;
const BAR_H = 6;
const SIDE = 40;

const THEME_BG = "./assets/theme-bg.jpg";
const COMPANY_LOGO = "./assets/logo-company.png";
const MICROSOFT_LOGO = "./assets/logo-microsoft.PNG";
const OUT = "./assets/footer-theme.png";

const LINE1 = "Powered by Azure AI Foundry";
const LINE2 = "Microsoft 365 Copilot · Copilot Studio";

// Theme pattern band, centre crop
const pattern = await sharp(THEME_BG)
  .resize(OUT_W, FOOTER_H, { fit: "cover", position: "centre" })
  .toBuffer();

// Darken behind the text so it reads on the pattern; accent bar along the top edge
const overlaySvg = `
<svg width="${OUT_W}" height="${FOOTER_H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="shade" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#07073A" stop-opacity="0.55"/>
      <stop offset="50%" stop-color="#07073A" stop-opacity="0.72"/>
      <stop offset="100%" stop-color="#07073A" stop-opacity="0.45"/>
    </linearGradient>
    <linearGradient id="bar" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#2A1AFF"/>
      <stop offset="55%" stop-color="#8A2BFF"/>
      <stop offset="100%" stop-color="#D23BFF"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#shade)"/>
  <rect width="100%" height="${BAR_H}" fill="url(#bar)"/>
</svg>`;

const textSvg = `
<svg width="${OUT_W}" height="${FOOTER_H}" xmlns="http://www.w3.org/2000/svg">
  <g font-family="Segoe UI, Arial, sans-serif" text-anchor="middle">
    <text x="${OUT_W / 2 + 2}" y="112" font-size="40" font-weight="700" fill="#05052A" fill-opacity="0.75">${LINE1}</text>
    <text x="${OUT_W / 2}" y="110" font-size="40" font-weight="700" fill="#FFFFFF">${LINE1}</text>
    <text x="${OUT_W / 2 + 2}" y="162" font-size="30" font-weight="600" fill="#05052A" fill-opacity="0.75">${LINE2}</text>
    <text x="${OUT_W / 2}" y="160" font-size="30" font-weight="600" fill="#E9DBFF">${LINE2}</text>
  </g>
</svg>`;

// Logos are artwork on solid black: trim the border, then key the black out to
// transparency (alpha from the brightest channel) so brand colours stay exact
async function logo(path, height) {
  const { data, info } = await sharp(path).flatten({ background: "#000" }).trim({ threshold: 20 })
    .resize({ height }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    const peak = Math.max(data[i], data[i + 1], data[i + 2]);
    data[i + 3] = Math.min(255, peak * 4);
  }
  const buf = await sharp(data, { raw: info }).png().toBuffer();
  return { buf, width: info.width, height: info.height };
}

const company = await logo(COMPANY_LOGO, 72);
const microsoft = await logo(MICROSOFT_LOGO, 46);
const midY = BAR_H + Math.round((FOOTER_H - BAR_H) / 2);

await sharp(pattern)
  .composite([
    { input: Buffer.from(overlaySvg), top: 0, left: 0 },
    { input: Buffer.from(textSvg), top: 0, left: 0 },
    { input: company.buf, top: midY - company.height / 2, left: SIDE },
    { input: microsoft.buf, top: midY - microsoft.height / 2, left: OUT_W - SIDE - microsoft.width },
  ])
  .png()
  .toFile(OUT);

console.log(`✅ ${OUT} created (${OUT_W}x${FOOTER_H}); logos ${company.width}px / ${microsoft.width}px wide`);
