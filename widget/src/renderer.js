import {
  globeRotY,
  globeZoom,
  earthTextureImage,
} from "./state.js";

function renderEarthTexture(ctx, cx, cy, r, rotation) {
  const img = earthTextureImage;
  if (!img) return;

  const iw = img.width;
  const ih = img.height;
  const drawW = (2 * r) * (iw / ih);
  const drawH = 2 * r;
  const ox = cx - drawW / 2;
  const oy = cy - drawH / 2;
  const turn = ((rotation / (2 * Math.PI)) % 1 + 1) % 1;
  const xShift = -turn * drawW;

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(img, ox + xShift - drawW, oy, drawW, drawH);
  ctx.drawImage(img, ox + xShift, oy, drawW, drawH);
  ctx.drawImage(img, ox + xShift + drawW, oy, drawW, drawH);
  ctx.restore();
}

function drawFallbackSphere(ctx, cx, cy, r) {
  const g = ctx.createRadialGradient(cx - r * 0.25, cy - r * 0.25, r * 0.15, cx, cy, r);
  g.addColorStop(0, "rgba(70, 120, 170, 0.55)");
  g.addColorStop(0.55, "rgba(22, 58, 94, 0.95)");
  g.addColorStop(1, "rgba(8, 20, 34, 1)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
}

export function drawWeatherOrbFrame(ctx, canvas, timeMs) {
  const width = canvas.width;
  const height = canvas.height;
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) * 0.34 * globeZoom;

  ctx.clearRect(0, 0, width, height);
  drawFallbackSphere(ctx, centerX, centerY, radius);

  renderEarthTexture(ctx, centerX, centerY, radius, globeRotY);
}
