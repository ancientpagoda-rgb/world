import { STAR_CATALOG, globeRotY, celestialBodies, STARS_URL } from "./state.js";
import { computeCelestialBodies } from "./planets.js";

export async function loadStarCatalog(url = STARS_URL) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Star catalog request failed: ${response.status}`);
  const stars = await response.json();
  if (!Array.isArray(stars)) throw new Error("Star catalog response is not an array");
  const catalog = [];
  for (let i = 0; i < stars.length; i++) {
    const s = stars[i];
    const bv = s.bv;
    let r, g, b;
    if (bv < -0.33) { r = 155; g = 175; b = 255; }
    else if (bv < 0) { r = 190 + (bv + 0.33) * 100; g = 200 + (bv + 0.33) * 80; b = 255; }
    else if (bv < 0.6) { r = 255; g = 235 - bv * 40; b = 220 - bv * 50; }
    else if (bv < 1.0) { r = 255; g = 210 - (bv - 0.6) * 120; b = 180 - (bv - 0.6) * 160; }
    else { r = 210 - (bv - 1.0) * 40; g = 160 - (bv - 1.0) * 40; b = 130 - (bv - 1.0) * 50; }
    const alpha = Math.max(0.08, 1 - (s.mag - 0.5) / 6.5);
    const size = Math.max(0.6, (6.5 - s.mag) * 0.35);
    const speed = 0.8 + Math.random() * 1.2;
    const phase = Math.random() * 6.2832;
    catalog.push({ ra: s.ra, dec: s.dec, r, g, b, baseAlpha: alpha, size, speed, phase });
  }
  return catalog; // caller sets STAR_CATALOG = result
}

export function renderStarfield(ctx, canvas, timeMs, options = {}) {
  const dpr = window.devicePixelRatio || 1;
  const w = Math.round(options.width || window.innerWidth);
  const h = Math.round(options.height || window.innerHeight);
  const offsetX = options.offsetX || 0;
  const offsetY = options.offsetY || 0;

  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = w * dpr;
    canvas.height = h * dpr;
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  let bodies = celestialBodies;
  if (!bodies) {
    bodies = computeCelestialBodies();
  }
  const raOffset = bodies.length ? (bodies[0].ra - 1.5 * Math.PI) : 0;

  // Milky Way glow
  const glowA = 0.007 + 0.005 * Math.sin(timeMs * 0.00004);
  for (let ra = 0; ra < 2 * Math.PI; ra += 0.06) {
    const mwDec = Math.atan(-1.966 * Math.cos(ra - 3.366));
    let nra = ((ra - raOffset + globeRotY) % (2 * Math.PI)) / (2 * Math.PI);
    if (nra < 0) nra += 1;
    const cx = nra * canvas.width + offsetX * dpr;
    const cy = (0.5 - mwDec / Math.PI) * canvas.height + offsetY * dpr;
    if (cx < -200 || cx > canvas.width + 200 || cy < -200 || cy > canvas.height + 200) continue;
    const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, 160 * dpr);
    gr.addColorStop(0, `rgba(160, 175, 220, ${glowA})`);
    gr.addColorStop(1, "rgba(160, 175, 220, 0)");
    ctx.fillStyle = gr;
    ctx.fillRect(cx - 160 * dpr, cy - 160 * dpr, 320 * dpr, 320 * dpr);
  }

  // Stars from HYG catalog
  let i = STAR_CATALOG.length;
  while (i--) {
    const s = STAR_CATALOG[i];
    const twinkle = 0.65 + 0.35 * Math.sin(timeMs * 0.001 * s.speed + s.phase);
    const alpha = s.baseAlpha * twinkle;
    if (alpha < 0.01) continue;
    let nra = ((s.ra - raOffset + globeRotY) % (2 * Math.PI)) / (2 * Math.PI);
    if (nra < 0) nra += 1;
    const sx = nra * canvas.width + offsetX * dpr;
    const sy = (0.5 - s.dec / Math.PI) * canvas.height + offsetY * dpr;
    if (sx < -5 || sx > canvas.width + 5 || sy < -5 || sy > canvas.height + 5) continue;
    ctx.fillStyle = `rgba(${s.r},${s.g},${s.b},${alpha})`;
    ctx.beginPath();
    ctx.arc(sx, sy, s.size * dpr, 0, 6.2832);
    ctx.fill();
  }

  // Sun and planets
  if (bodies.length) {
    for (const b of bodies) {
      let nra = ((b.ra - raOffset + globeRotY) % (2 * Math.PI)) / (2 * Math.PI);
      if (nra < 0) nra += 1;
      const bx = nra * canvas.width + offsetX * dpr;
      const by = (0.5 - b.dec / Math.PI) * canvas.height + offsetY * dpr;
      if (bx < -100 || bx > canvas.width + 100 || by < -100 || by > canvas.height + 100) continue;

      if (b.sun) {
        const gr1 = ctx.createRadialGradient(bx, by, 0, bx, by, b.s * 8 * dpr);
        gr1.addColorStop(0, "rgba(255, 250, 240, 0.04)");
        gr1.addColorStop(1, "rgba(255, 250, 240, 0)");
        ctx.fillStyle = gr1;
        ctx.fillRect(bx - b.s * 8 * dpr, by - b.s * 8 * dpr, b.s * 16 * dpr, b.s * 16 * dpr);

        const gr2 = ctx.createRadialGradient(bx, by, 0, bx, by, b.s * 2.5 * dpr);
        gr2.addColorStop(0, "rgba(255, 250, 235, 0.25)");
        gr2.addColorStop(0.5, "rgba(255, 240, 220, 0.08)");
        gr2.addColorStop(1, "rgba(255, 240, 220, 0)");
        ctx.fillStyle = gr2;
        ctx.fillRect(bx - b.s * 2.5 * dpr, by - b.s * 2.5 * dpr, b.s * 5 * dpr, b.s * 5 * dpr);

        const coreEnd = 1 - 3 / (b.s * dpr);
        const gr3 = ctx.createRadialGradient(bx, by, 0, bx, by, b.s * dpr);
        gr3.addColorStop(0, "rgba(255, 250, 240, 1)");
        gr3.addColorStop(coreEnd * 0.5, "rgba(255, 245, 230, 0.95)");
        gr3.addColorStop(coreEnd, "rgba(255, 240, 215, 0.3)");
        gr3.addColorStop(1, "rgba(255, 240, 215, 0)");
        ctx.fillStyle = gr3;
        ctx.beginPath();
        ctx.arc(bx, by, b.s * dpr, 0, 6.2832);
        ctx.fill();
      } else {
        const glow = ctx.createRadialGradient(bx, by, 0, bx, by, b.s * 3 * dpr);
        glow.addColorStop(0, `rgba(${b.c[0]},${b.c[1]},${b.c[2]},0.2)`);
        glow.addColorStop(1, `rgba(${b.c[0]},${b.c[1]},${b.c[2]},0)`);
        ctx.fillStyle = glow;
        ctx.fillRect(bx - b.s * 3 * dpr, by - b.s * 3 * dpr, b.s * 6 * dpr, b.s * 6 * dpr);

        ctx.fillStyle = `rgba(${b.c[0]},${b.c[1]},${b.c[2]},0.9)`;
        ctx.beginPath();
        ctx.arc(bx, by, Math.max(1.5, b.s * 0.8) * dpr, 0, 6.2832);
        ctx.fill();
      }
    }
  }
}
