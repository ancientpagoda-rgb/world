import {
  globeRotY,
  globeRotX,
  globeZoom,
  earthTextureImage,
} from "./state.js";

function renderEarthTexture(ctx, cx, cy, r, rotation) {
  const img = earthTextureImage;
  if (!img) return;
  const iw = img.width, ih = img.height;
  const halfIw = iw / 2;

  let srcX = (((rotation + Math.PI / 2) % (2 * Math.PI)) / (2 * Math.PI)) * iw;
  if (srcX < 0) srcX += iw;
  const wrap = srcX + halfIw > iw;

  for (let dy = -r; dy <= r; dy++) {
    const y = cy + dy;
    const sinP = dy / r;
    if (Math.abs(sinP) >= 1) continue;
    const cosP = Math.cos(Math.asin(sinP));
    const sw = Math.round(2 * r * cosP);
    if (sw < 2) continue;
    const sy = (Math.PI / 2 + Math.asin(sinP)) / Math.PI * ih;
    const dx = Math.round(cx - sw / 2);

    if (!wrap) {
      ctx.drawImage(img, srcX, sy, halfIw, 1, dx, y, sw, 1);
    } else {
      const w1 = Math.round(iw - srcX);
      const f = w1 / halfIw;
      const dw1 = Math.round(sw * f);
      if (dw1 > 0) {
        ctx.drawImage(img, srcX, sy, w1, 1, dx, y, dw1, 1);
        ctx.drawImage(img, 0, sy, halfIw - w1, 1, dx + dw1, y, sw - dw1, 1);
      } else {
        ctx.drawImage(img, 0, sy, halfIw, 1, dx, y, sw, 1);
      }
    }
  }
}

export function drawWeatherOrbFrame(ctx, canvas, timeMs) {
  const width = canvas.width;
  const height = canvas.height;
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) * 0.34 * globeZoom;

  ctx.clearRect(0, 0, width, height);

  // Base sphere fill so the globe reads as a lit object, not a flat cutout.
  ctx.fillStyle = "#0b253c";
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, 6.2832);
  ctx.fill();

  const rotY = globeRotY, rotX = globeRotX;

  // Clip to globe circle — everything below stays inside
  ctx.save();
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, 6.2832);
  ctx.clip();

  // Earth satellite texture (opaque scanlines)
  renderEarthTexture(ctx, centerX, centerY, radius, rotY);

  ctx.restore(); // remove clip
}
