const sharp = require("sharp");

const INK = "#0e100f";
const BLUE = "#2a78d6";
const ORANGE = "#eb6834";
const SIZES = [16, 32, 48, 128];

function iconSvg(size) {
  const pad = Math.max(1, Math.round(size * 0.06));
  const radius = Math.round(size * 0.22);
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.3;
  const ringWidth = Math.max(1, Math.round(size * 0.055));
  const handLenMin = r * 0.62;
  const handLenHr = r * 0.38;
  const aMin = (-50 * Math.PI) / 180;
  const aHr = (120 * Math.PI) / 180;
  const minX = cx + handLenMin * Math.sin(aMin);
  const minY = cy - handLenMin * Math.cos(aMin);
  const hrX = cx + handLenHr * Math.sin(aHr);
  const hrY = cy - handLenHr * Math.cos(aHr);
  const centerDot = Math.max(1, Math.round(size * 0.045));
  const tickR = Math.max(1, Math.round(size * 0.05));
  const blueX = cx + r * Math.sin(aMin);
  const blueY = cy - r * Math.cos(aMin);
  const orangeX = cx + r * Math.sin(aHr);
  const orangeY = cy - r * Math.cos(aHr);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect x="${pad}" y="${pad}" width="${size - pad * 2}" height="${size - pad * 2}" rx="${radius}" fill="${INK}" />
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#ffffff" stroke-width="${ringWidth}" />
  <line x1="${cx}" y1="${cy}" x2="${minX}" y2="${minY}" stroke="#ffffff" stroke-width="${ringWidth}" stroke-linecap="round" />
  <line x1="${cx}" y1="${cy}" x2="${hrX}" y2="${hrY}" stroke="#ffffff" stroke-width="${ringWidth}" stroke-linecap="round" />
  <circle cx="${cx}" cy="${cy}" r="${centerDot}" fill="#ffffff" />
  <circle cx="${blueX}" cy="${blueY}" r="${tickR}" fill="${BLUE}" />
  <circle cx="${orangeX}" cy="${orangeY}" r="${tickR}" fill="${ORANGE}" />
</svg>`;
}

async function main() {
  for (const size of SIZES) {
    await sharp(Buffer.from(iconSvg(size)))
      .png()
      .toFile(`${__dirname}/extension/icons/icon${size}.png`);
  }
  console.log("done");
}

main();