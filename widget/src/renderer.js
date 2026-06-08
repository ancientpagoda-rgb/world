import {
  globeRotY,
  globeRotX,
  globeZoom,
  earthTextureImage,
  celestialBodies,
} from "./state.js";

function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

function rgba(color, alpha) {
  return `rgba(${color[0]},${color[1]},${color[2]},${alpha})`;
}

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
  const moonAngle = timeMs * 0.00003;
  const moonDist = radius * 2;
  const moonX = centerX + Math.cos(moonAngle) * moonDist;
  const moonY = centerY + Math.sin(moonAngle) * moonDist * 0.6 - radius * 0.6;

  // Clip to globe circle — everything below stays inside
  ctx.save();
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, 6.2832);
  ctx.clip();

  // Earth satellite texture (opaque scanlines)
  renderEarthTexture(ctx, centerX, centerY, radius, rotY);

  ctx.restore(); // remove clip

  // Weather layer indicator
  const cycle = timeMs / 5200;
  const currentIndex = Math.floor(cycle) % 4;
  const nextIndex = (currentIndex + 1) % 4;
  const transition = smoothstep(cycle % 1);
  const layerNames = ["temperature", "rainfall", "clouds", "wind"];
  const currentLayer = layerNames[currentIndex];
  const nextLayer = layerNames[nextIndex];

  const infoY = centerY + radius + 20;
  ctx.fillStyle = "rgba(200, 220, 240, 0.35)";
  ctx.font = "11px 'IBM Plex Mono', monospace";
  ctx.textAlign = "center";
  const label = currentLayer.charAt(0).toUpperCase() + currentLayer.slice(1);
  ctx.fillText(label, centerX, infoY);

  // Moon
  ctx.save();
  const moonGrad = ctx.createRadialGradient(moonX, moonY, 0, moonX, moonY, 4);
  moonGrad.addColorStop(0, "rgba(220, 220, 230, 0.32)");
  moonGrad.addColorStop(0.5, "rgba(180, 180, 200, 0.12)");
  moonGrad.addColorStop(1, "rgba(180, 180, 200, 0)");
  ctx.fillStyle = moonGrad;
  ctx.beginPath();
  ctx.arc(moonX, moonY, 4, 0, 6.2832);
  ctx.fill();
  ctx.restore();
}
