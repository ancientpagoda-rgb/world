import { setStarCatalog, setStarsUrl, celestialBodies, setCelestialBodies, setCelestialEpoch, getCelestialEpoch, globeRotY } from "./state.js";
import { computeCelestialBodies } from "./planets.js";
import { loadStarCatalog, renderStarfield } from "./starfield.js";
import { loadEarthTexture } from "./textures.js";
import { loadLiveWeatherGrid } from "./weather.js";
import { drawWeatherOrbFrame } from "./renderer.js";
import { setupGlobeInteraction } from "./interaction.js";

const instances = new Map();

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

  // Load resources
  loadEarthTexture();
  if (opts.weather) {
    loadLiveWeatherGrid().catch(() => {});
  }

  // Star catalog
  (async () => {
    const catalog = await loadStarCatalog();
    setStarCatalog(catalog);
  })();

  // Drag
  let disposeInteraction = null;
  if (opts.drag) {
    disposeInteraction = setupGlobeInteraction(globeCanvas);
  }

  // Resize handler
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

  // Render loop
  let running = true;
  const render = (timestamp) => {
    if (!running) return;
    refreshBodies();
    if (opts.stars) {
      renderStarfield(starfieldCtx, starfieldCanvas, timestamp, {
        width: wrapper.clientWidth,
        height: wrapper.clientHeight,
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
