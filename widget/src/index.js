import { setStarCatalog, setStarsUrl, celestialBodies, setCelestialBodies, setCelestialEpoch, getCelestialEpoch, globeRotY } from "./state.js";
import { computeCelestialBodies } from "./planets.js";
import { loadStarCatalog, renderStarfield } from "./starfield.js";
import { loadEarthTexture } from "./textures.js";
import { drawWeatherOrbFrame } from "./renderer.js";
import { setupGlobeInteraction } from "./interaction.js";

const instances = new Map();
const WIDGET_RENDER_SCALE = 0.62;
const WIDGET_FPS = 12;

function refreshBodies() {
  const now = Date.now();
  if (now - getCelestialEpoch() > 600000) {
    setCelestialBodies(computeCelestialBodies());
    setCelestialEpoch(now);
  }
}

export function mount(selector, options = {}) {
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
    geojsonUrl: options.geojsonUrl || "https://unpkg.com/visionscarto-world-atlas@0.0.4/world/50m_countries.geojson",
  };

  if (opts.starsUrl) setStarsUrl(opts.starsUrl);

  container.innerHTML = "";

  const starfieldCanvas = document.createElement("canvas");
  starfieldCanvas.className = "earth-globe-starfield";
  starfieldCanvas.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:0;image-rendering:pixelated;";
  starfieldCanvas.width = 1;
  starfieldCanvas.height = 1;

  const globeCanvas = document.createElement("canvas");
  globeCanvas.className = "earth-globe-canvas";
  globeCanvas.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;z-index:1;image-rendering:pixelated;image-rendering:crisp-edges;";
  globeCanvas.width = 1;
  globeCanvas.height = 1;
  globeCanvas.tabIndex = 0;
  globeCanvas.setAttribute("role", "application");
  globeCanvas.setAttribute("aria-label", "Interactive Earth globe. Drag to rotate and use arrow keys to rotate.");

  const wrapper = document.createElement("div");
  wrapper.className = "earth-globe-container";
  wrapper.style.cssText = `position:relative;width:${opts.width};height:${opts.height}px;overflow:hidden;background:${opts.background};border-radius:8px;`;
  wrapper.appendChild(starfieldCanvas);
  wrapper.appendChild(globeCanvas);
  container.appendChild(wrapper);

  const globeCtx = globeCanvas.getContext("2d");
  const starfieldCtx = starfieldCanvas.getContext("2d");

  // Load resources
  loadEarthTexture();
  // Star catalog
  (async () => {
    try {
      const catalog = await loadStarCatalog(opts.starsUrl);
      setStarCatalog(catalog);
    } catch (error) {
      console.warn("Could not load star catalog; continuing without catalog stars.", error);
      setStarCatalog([]);
    }
  })();

  // Drag
  let disposeInteraction = null;
  if (opts.drag) {
    disposeInteraction = setupGlobeInteraction(globeCanvas);
  }

  // Resize handler
  const onResize = () => {
    const rect = wrapper.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 1) * WIDGET_RENDER_SCALE;
    globeCanvas.width = Math.round(rect.width * dpr);
    globeCanvas.height = Math.round(rect.height * dpr);
    globeCtx.imageSmoothingEnabled = false;
    if (opts.stars) {
      starfieldCanvas.width = Math.round(rect.width * dpr);
      starfieldCanvas.height = Math.round(rect.height * dpr);
    }
  };
  onResize();
  window.addEventListener("resize", onResize);

  // Render loop
  let running = true;
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
  const minFrameMs = reducedMotion ? 250 : 1000 / WIDGET_FPS;
  let pageVisible = document.visibilityState !== "hidden";
  let globeVisible = true;
  let frameTimer = 0;
  let frameQueued = false;
  let lastRenderMs = Number.NEGATIVE_INFINITY;
  const canRender = () => running && pageVisible && globeVisible;
  const cancelScheduledFrame = () => {
    if (frameTimer) window.clearTimeout(frameTimer);
    frameTimer = 0;
    frameQueued = false;
  };
  const scheduleRender = (delay = 0) => {
    if (!canRender() || frameQueued) return;
    frameQueued = true;
    frameTimer = window.setTimeout(() => {
      frameTimer = 0;
      requestAnimationFrame(render);
    }, Math.max(0, delay));
  };
  const render = (timestamp) => {
    frameQueued = false;
    if (!canRender()) return;
    if (timestamp - lastRenderMs < minFrameMs) {
      scheduleRender(minFrameMs - (timestamp - lastRenderMs));
      return;
    }
    lastRenderMs = timestamp;
    refreshBodies();
    if (opts.stars) {
      renderStarfield(starfieldCtx, starfieldCanvas, timestamp, {
        width: wrapper.clientWidth,
        height: wrapper.clientHeight,
        renderDpr: WIDGET_RENDER_SCALE,
      });
    }
    globeCtx.clearRect(0, 0, globeCanvas.width, globeCanvas.height);
    drawWeatherOrbFrame(globeCtx, globeCanvas, timestamp);
    scheduleRender(minFrameMs);
  };

  const onVisibilityChange = () => {
    pageVisible = document.visibilityState !== "hidden";
    if (pageVisible) {
      lastRenderMs = Number.NEGATIVE_INFINITY;
      scheduleRender();
    } else {
      cancelScheduledFrame();
    }
  };
  document.addEventListener("visibilitychange", onVisibilityChange);
  const observer = "IntersectionObserver" in window
    ? new IntersectionObserver(([entry]) => {
        globeVisible = entry.isIntersecting;
        if (globeVisible) {
          lastRenderMs = Number.NEGATIVE_INFINITY;
          scheduleRender();
        } else {
          cancelScheduledFrame();
        }
      }, { threshold: 0.01 })
    : null;
  observer?.observe(wrapper);
  scheduleRender();

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
      cancelScheduledFrame();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      observer?.disconnect();
      if (disposeInteraction) disposeInteraction();
      window.removeEventListener("resize", onResize);
      wrapper.remove();
      instances.delete(selector);
    },
    update(newOptions) {
      Object.assign(opts, newOptions);
    },
  };

  instances.set(selector, instance);
  return instance;
}

export function destroy(selector) {
  const inst = instances.get(selector);
  if (inst) inst.destroy();
}

export function update(selector, options) {
  const inst = instances.get(selector);
  if (inst) inst.update(options);
}

export default { mount, destroy, update, version: "1.0.0" };
