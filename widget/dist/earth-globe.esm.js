// src/state.js
var EARTH_TEXTURE_URL = "https://unpkg.com/three-globe@2.31.0/example/img/earth-blue-marble.jpg";
var STARS_URL = "./stars.json";
function setStarsUrl(url) {
  STARS_URL = url;
}
var WEATHER_API_BASE = "https://api.open-meteo.com/v1/forecast";
var weatherOrbState = {
  loading: false,
  loaded: false,
  features: [],
  countryShapes: null,
  gridData: [],
  weatherSource: "Synthetic fallback",
  currentGrid: null,
  nextGrid: null,
  currentGridLoaded: false,
  nextGridLoaded: false,
  currentGridLoading: false,
  nextGridLoading: false,
  currentSlot: 0,
  nextSlot: 1
};
var globeRotY = 0;
var globeRotX = 0;
var globeZoom = 1;
var globeDrag = { active: false, startX: 0, startY: 0, startRotY: 0, startRotX: 0 };
function setGlobeRotY(v) {
  globeRotY = v;
}
function setGlobeRotX(v) {
  globeRotX = v;
}
function setGlobeZoom(v) {
  globeZoom = v;
}
var earthTextureImage = null;
function setEarthTexture(img) {
  earthTextureImage = img;
}
var STAR_CATALOG = [];
function setStarCatalog(c) {
  STAR_CATALOG = c;
}
var celestialBodies = null;
var celestialEpoch = 0;
function setCelestialBodies(b) {
  celestialBodies = b;
}
function getCelestialEpoch() {
  return celestialEpoch;
}
function setCelestialEpoch(e) {
  celestialEpoch = e;
}

// src/planets.js
var PLANET_DATA = [
  { name: "Sun", a: 0, e: 0, i: 0, Omega: 0, varpi: 0, L: 0, epoch: 0, sun: 1, color: [255, 220, 150] },
  { name: "Mercury", a: 0.387099, e: 0.20563, i: 7.004979, Omega: 48.330766, varpi: 77.457796, L: 252.250324, epoch: "2000-01-01", sun: 0, color: [200, 200, 200] },
  { name: "Venus", a: 0.723336, e: 6772e-6, i: 3.394662, Omega: 76.679843, varpi: 131.563703, L: 181.979733, epoch: "2000-01-01", sun: 0, color: [240, 220, 180] },
  { name: "Earth", a: 1.000002, e: 0.016709, i: -15e-6, Omega: 0, varpi: 102.937348, L: 100.464441, epoch: "2000-01-01", sun: 0, color: [100, 180, 255] },
  { name: "Mars", a: 1.523679, e: 0.0934, i: 1.849726, Omega: 49.558093, varpi: 336.060234, L: 355.462999, epoch: "2000-01-01", sun: 0, color: [220, 160, 100] },
  { name: "Jupiter", a: 5.202603, e: 0.048498, i: 1.303097, Omega: 100.473909, varpi: 14.056466, L: 34.39644, epoch: "2000-01-01", sun: 0, color: [240, 210, 170] },
  { name: "Saturn", a: 9.041212, e: 0.053862, i: 2.488879, Omega: 113.665525, varpi: 92.598878, L: 49.954244, epoch: "2000-01-01", sun: 0, color: [230, 210, 180] },
  { name: "Uranus", a: 19.165164, e: 0.047318, i: 0.773288, Omega: 74.006015, varpi: 170.954276, L: 313.232179, epoch: "2000-01-01", sun: 0, color: [180, 220, 240] },
  { name: "Neptune", a: 30.069923, e: 859e-5, i: 1.769953, Omega: 131.784226, varpi: 44.969764, L: 304.88003, epoch: "2000-01-01", sun: 0, color: [160, 180, 230] }
];
var J2000 = /* @__PURE__ */ new Date("2000-01-01T12:00:00Z");
var DEG = Math.PI / 180;
var OBLIQUITY = 23.439292 * DEG;
function daysSinceJ2000(date) {
  return (date - J2000) / 864e5;
}
function keplerE(M, e) {
  let E = M;
  for (let i = 0; i < 5; i++) E = M + e * Math.sin(E);
  return E;
}
function heliocentricPos(d, body) {
  const n = 0.9856076686 / body.a ** 1.5;
  const M = (body.L + n * d) * DEG;
  const E = keplerE(M, body.e);
  const xp = body.a * (Math.cos(E) - body.e);
  const yp = body.a * Math.sqrt(1 - body.e * body.e) * Math.sin(E);
  const ec = body.varpi * DEG;
  const inc = body.i * DEG;
  const Om = body.Omega * DEG;
  const xeh = Math.cos(ec) * xp - Math.sin(ec) * yp;
  const yeh = Math.sin(ec) * xp + Math.cos(ec) * yp;
  const x = xeh;
  const y = yeh * Math.cos(inc);
  const z = yeh * Math.sin(inc);
  const xg = x * Math.cos(Om) - y * Math.sin(Om);
  const yg = x * Math.sin(Om) + y * Math.cos(Om);
  return { x: xg, y: yg, z };
}
function eclipticToEq(lon, lat) {
  const x = Math.cos(lat) * Math.cos(lon);
  const y = Math.cos(lat) * Math.sin(lon);
  const z = Math.sin(lat);
  const yeq = y * Math.cos(OBLIQUITY) - z * Math.sin(OBLIQUITY);
  const zeq = y * Math.sin(OBLIQUITY) + z * Math.cos(OBLIQUITY);
  const ra = Math.atan2(yeq, x);
  const dec = Math.atan2(zeq, Math.sqrt(x * x + yeq * yeq));
  return { ra, dec };
}
function computeCelestialBodies() {
  const now = /* @__PURE__ */ new Date();
  const d = daysSinceJ2000(now);
  const bodies = [];
  for (const p of PLANET_DATA) {
    if (p.name === "Sun") {
      const ed = heliocentricPos(d, PLANET_DATA[3]);
      const { ra: ra2, dec: dec2 } = eclipticToEq(Math.atan2(-ed.y, -ed.x), 0);
      bodies.push({ ra: ra2, dec: dec2, s: 12, sun: 1, c: p.color, name: p.name });
      continue;
    }
    const pos = heliocentricPos(d, p);
    const earth = heliocentricPos(d, PLANET_DATA[3]);
    const dx = pos.x - earth.x;
    const dy = pos.y - earth.y;
    const dz = pos.z - earth.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const eclLon = Math.atan2(dy, dx);
    const eclLat = Math.asin(dz / dist);
    const { ra, dec } = eclipticToEq(eclLon, eclLat);
    const appSize = p.name === "Sun" ? 12 : p.name === "Moon" ? 8 : Math.max(1.5, 6 / dist);
    bodies.push({ ra, dec, s: appSize, sun: 0, c: p.color, name: p.name });
  }
  return bodies;
}

// src/starfield.js
async function loadStarCatalog() {
  const response = await fetch(STARS_URL);
  const stars = await response.json();
  const catalog = [];
  for (let i = 0; i < stars.length; i++) {
    const s = stars[i];
    const bv = s.bv;
    let r, g, b;
    if (bv < -0.33) {
      r = 155;
      g = 175;
      b = 255;
    } else if (bv < 0) {
      r = 190 + (bv + 0.33) * 100;
      g = 200 + (bv + 0.33) * 80;
      b = 255;
    } else if (bv < 0.6) {
      r = 255;
      g = 235 - bv * 40;
      b = 220 - bv * 50;
    } else if (bv < 1) {
      r = 255;
      g = 210 - (bv - 0.6) * 120;
      b = 180 - (bv - 0.6) * 160;
    } else {
      r = 210 - (bv - 1) * 40;
      g = 160 - (bv - 1) * 40;
      b = 130 - (bv - 1) * 50;
    }
    const alpha = Math.max(0.08, 1 - (s.mag - 0.5) / 6.5);
    const size = Math.max(0.6, (6.5 - s.mag) * 0.35);
    const speed = 0.8 + Math.random() * 1.2;
    const phase = Math.random() * 6.2832;
    catalog.push({ ra: s.ra, dec: s.dec, r, g, b, baseAlpha: alpha, size, speed, phase });
  }
  return catalog;
}
function renderStarfield(ctx, canvas, timeMs, options = {}) {
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
  const raOffset = bodies.length ? bodies[0].ra - 1.5 * Math.PI : 0;
  const glowA = 7e-3 + 5e-3 * Math.sin(timeMs * 4e-5);
  for (let ra = 0; ra < 2 * Math.PI; ra += 0.06) {
    const mwDec = Math.atan(-1.966 * Math.cos(ra - 3.366));
    let nra = (ra - raOffset + globeRotY) % (2 * Math.PI) / (2 * Math.PI);
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
  let i = STAR_CATALOG.length;
  while (i--) {
    const s = STAR_CATALOG[i];
    const twinkle = 0.65 + 0.35 * Math.sin(timeMs * 1e-3 * s.speed + s.phase);
    const alpha = s.baseAlpha * twinkle;
    if (alpha < 0.01) continue;
    let nra = (s.ra - raOffset + globeRotY) % (2 * Math.PI) / (2 * Math.PI);
    if (nra < 0) nra += 1;
    const sx = nra * canvas.width + offsetX * dpr;
    const sy = (0.5 - s.dec / Math.PI) * canvas.height + offsetY * dpr;
    if (sx < -5 || sx > canvas.width + 5 || sy < -5 || sy > canvas.height + 5) continue;
    ctx.fillStyle = `rgba(${s.r},${s.g},${s.b},${alpha})`;
    ctx.beginPath();
    ctx.arc(sx, sy, s.size * dpr, 0, 6.2832);
    ctx.fill();
  }
  if (bodies.length) {
    for (const b of bodies) {
      let nra = (b.ra - raOffset + globeRotY) % (2 * Math.PI) / (2 * Math.PI);
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

// src/textures.js
function loadEarthTexture() {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = EARTH_TEXTURE_URL;
  img.onload = () => setEarthTexture(img);
  img.onerror = () => setEarthTexture(null);
}

// src/weather.js
function buildWeatherGridCoordinates() {
  const coords = [];
  for (let lat = -80; lat <= 80; lat += 10) {
    for (let lon = -180; lon < 180; lon += 10) {
      coords.push({ lat, lon });
    }
  }
  return coords;
}
async function loadLiveWeatherGrid() {
  const coords = buildWeatherGridCoordinates();
  const batchSize = 20;
  const allData = [];
  for (let i = 0; i < coords.length; i += batchSize) {
    const batch = coords.slice(i, i + batchSize);
    const params = batch.map((c) => `${c.lat},${c.lon}`).join(",");
    const url = `${WEATHER_API_BASE}?latitude=${batch.map((c) => c.lat).join(",")}&longitude=${batch.map((c) => c.lon).join(",")}&current=temperature_2m,precipitation,cloud_cover,wind_speed_10m,wind_direction_10m,wind_u_component_10m,wind_v_component_10m&timezone=auto`;
    try {
      const resp = await fetch(url);
      const json = await resp.json();
      if (json.current_weather) {
        allData.push(json.current_weather);
      }
    } catch (_) {
    }
  }
  weatherOrbState.gridData = allData;
  weatherOrbState.weatherSource = "Open-Meteo";
  return allData;
}

// src/renderer.js
function smoothstep(t) {
  return t * t * (3 - 2 * t);
}
function renderEarthTexture(ctx, cx, cy, r, rotation) {
  const img = earthTextureImage;
  if (!img) return;
  const iw = img.width, ih = img.height;
  const halfIw = iw / 2;
  let srcX = (rotation + Math.PI / 2) % (2 * Math.PI) / (2 * Math.PI) * iw;
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
function drawWeatherOrbFrame(ctx, canvas, timeMs) {
  const width = canvas.width;
  const height = canvas.height;
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) * 0.34 * globeZoom;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#0b253c";
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, 6.2832);
  ctx.fill();
  const rotY = globeRotY, rotX = globeRotX;
  const moonAngle = timeMs * 3e-5;
  const moonDist = radius * 2;
  const moonX = centerX + Math.cos(moonAngle) * moonDist;
  const moonY = centerY + Math.sin(moonAngle) * moonDist * 0.6 - radius * 0.6;
  ctx.save();
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, 6.2832);
  ctx.clip();
  renderEarthTexture(ctx, centerX, centerY, radius, rotY);
  ctx.restore();
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

// src/interaction.js
function setupGlobeInteraction(canvas, opts = {}) {
  canvas.style.touchAction = "none";
  canvas.style.cursor = "grab";
  const onStart = (clientX, clientY) => {
    globeDrag.active = true;
    globeDrag.startX = clientX;
    globeDrag.startY = clientY;
    globeDrag.startRotY = globeRotY;
    globeDrag.startRotX = globeRotX;
    canvas.style.cursor = "grabbing";
  };
  const onMove = (clientX, clientY) => {
    if (!globeDrag.active) return;
    const rect = canvas.getBoundingClientRect();
    const dragScale = Math.max(1, Math.min(rect.width, rect.height));
    const dx = clientX - globeDrag.startX;
    setGlobeRotY(globeDrag.startRotY - dx / dragScale * Math.PI * 1.4);
    setGlobeRotX(0);
  };
  const onEnd = () => {
    globeDrag.active = false;
    canvas.style.cursor = "grab";
  };
  const onMouseDown = (e) => onStart(e.clientX, e.clientY);
  const onMouseMove = (e) => onMove(e.clientX, e.clientY);
  const onWheel = (e) => {
    e.preventDefault();
    const z = globeZoom * Math.exp(-e.deltaY * 1e-3);
    setGlobeZoom(Math.max(0.3, Math.min(4, z)));
  };
  const onTouchStart = (e) => {
    if (e.touches.length === 1) onStart(e.touches[0].clientX, e.touches[0].clientY);
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchDist = Math.sqrt(dx * dx + dy * dy);
    }
  };
  const onTouchMove = (e) => {
    if (e.touches.length === 1) {
      e.preventDefault();
      onMove(e.touches[0].clientX, e.touches[0].clientY);
    }
    if (e.touches.length === 2) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (pinchDist > 0) {
        const z = globeZoom * (dist / pinchDist);
        setGlobeZoom(Math.max(0.3, Math.min(4, z)));
      }
      pinchDist = dist;
    }
  };
  const onTouchEnd = (e) => {
    if (e.touches.length < 2) pinchDist = 0;
    if (e.touches.length === 0) onEnd();
  };
  canvas.addEventListener("mousedown", onMouseDown);
  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("mouseup", onEnd);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  let pinchDist = 0;
  canvas.addEventListener("touchstart", onTouchStart, { passive: true });
  canvas.addEventListener("touchmove", onTouchMove, { passive: false });
  canvas.addEventListener("touchend", onTouchEnd, { passive: true });
  canvas.addEventListener("touchcancel", onTouchEnd, { passive: true });
  return () => {
    canvas.removeEventListener("mousedown", onMouseDown);
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onEnd);
    canvas.removeEventListener("wheel", onWheel);
    canvas.removeEventListener("touchstart", onTouchStart);
    canvas.removeEventListener("touchmove", onTouchMove);
    canvas.removeEventListener("touchend", onTouchEnd);
    canvas.removeEventListener("touchcancel", onTouchEnd);
  };
}

// src/index.js
var instances = /* @__PURE__ */ new Map();
function refreshBodies() {
  const now = Date.now();
  if (now - getCelestialEpoch() > 6e5) {
    setCelestialBodies(computeCelestialBodies());
    setCelestialEpoch(now);
  }
}
function mount(selector, options = {}) {
  const container = document.querySelector(selector);
  if (!container) throw new Error(`No element found for selector "${selector}"`);
  if (instances.has(selector)) {
    console.warn(`Widget already mounted on "${selector}". Call destroy() first.`);
    return instances.get(selector);
  }
  const opts = {
    width: options.width || "100%",
    height: options.height || 400,
    stars: options.stars !== false,
    weather: options.weather === true,
    borders: options.borders !== false,
    nightLights: options.nightLights !== false,
    drag: options.drag !== false,
    theme: options.theme || "dark",
    onCountryClick: options.onCountryClick || null,
    background: options.background || "#111418",
    starsUrl: options.starsUrl || "./stars.json",
    geojsonUrl: options.geojsonUrl || "https://unpkg.com/visionscarto-world-atlas@0.0.4/world/50m_countries.geojson"
  };
  if (opts.starsUrl) setStarsUrl(opts.starsUrl);
  container.innerHTML = "";
  const starfieldCanvas = document.createElement("canvas");
  starfieldCanvas.className = "earth-globe-starfield";
  starfieldCanvas.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:0;";
  starfieldCanvas.width = 1;
  starfieldCanvas.height = 1;
  const globeCanvas = document.createElement("canvas");
  globeCanvas.className = "earth-globe-canvas";
  globeCanvas.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;z-index:1;";
  globeCanvas.width = 1;
  globeCanvas.height = 1;
  const wrapper = document.createElement("div");
  wrapper.className = "earth-globe-container";
  wrapper.style.cssText = `position:relative;width:${opts.width};height:${opts.height}px;overflow:hidden;background:${opts.background};border-radius:8px;`;
  wrapper.appendChild(starfieldCanvas);
  wrapper.appendChild(globeCanvas);
  container.appendChild(wrapper);
  const globeCtx = globeCanvas.getContext("2d");
  const starfieldCtx = starfieldCanvas.getContext("2d");
  loadEarthTexture();
  if (opts.weather) {
    loadLiveWeatherGrid().catch(() => {
    });
  }
  (async () => {
    const catalog = await loadStarCatalog();
    setStarCatalog(catalog);
  })();
  let disposeInteraction = null;
  if (opts.drag) {
    disposeInteraction = setupGlobeInteraction(globeCanvas);
  }
  const onResize = () => {
    const rect = wrapper.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    globeCanvas.width = Math.round(rect.width * dpr);
    globeCanvas.height = Math.round(rect.height * dpr);
    if (opts.stars) {
      starfieldCanvas.width = Math.round(rect.width * dpr);
      starfieldCanvas.height = Math.round(rect.height * dpr);
    }
  };
  onResize();
  window.addEventListener("resize", onResize);
  let running = true;
  const render = (timestamp) => {
    if (!running) return;
    refreshBodies();
    if (opts.stars) {
      renderStarfield(starfieldCtx, starfieldCanvas, timestamp, {
        width: wrapper.clientWidth,
        height: wrapper.clientHeight
      });
    }
    globeCtx.clearRect(0, 0, globeCanvas.width, globeCanvas.height);
    drawWeatherOrbFrame(globeCtx, globeCanvas, timestamp);
    requestAnimationFrame(render);
  };
  requestAnimationFrame(render);
  const instance = {
    selector,
    wrapper,
    globeCanvas,
    starfieldCanvas,
    options: opts,
    running,
    onResize,
    destroy() {
      running = false;
      if (disposeInteraction) disposeInteraction();
      window.removeEventListener("resize", onResize);
      wrapper.remove();
      instances.delete(selector);
    },
    update(newOptions) {
      Object.assign(opts, newOptions);
    }
  };
  instances.set(selector, instance);
  return instance;
}
function destroy(selector) {
  const inst = instances.get(selector);
  if (inst) inst.destroy();
}
function update(selector, options) {
  const inst = instances.get(selector);
  if (inst) inst.update(options);
}
var index_default = { mount, destroy, update, version: "1.0.0" };
export {
  index_default as default,
  destroy,
  mount,
  update
};
