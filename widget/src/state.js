export const EARTH_TEXTURE_URL = "https://unpkg.com/three-globe@2.31.0/example/img/earth-blue-marble.jpg";
export let STARS_URL = "./stars.json";
export function setStarsUrl(url) { STARS_URL = url; }
export const WORLD_GEOJSON_URL = "https://unpkg.com/visionscarto-world-atlas@0.0.4/world/50m_countries.geojson";
export const WEATHER_API_BASE = "https://api.open-meteo.com/v1/forecast";
export const WEATHER_LAYER_DURATION_MS = 5200;
export const WEATHER_LAYERS = ["temperature", "rainfall", "clouds", "wind"];

export const weatherOrbState = {
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
  nextSlot: 1,
};

export let globeRotY = 0;
export let globeRotX = 0;
export let globeZoom = 1;
export const globeDrag = { active: false, startX: 0, startY: 0, startRotY: 0, startRotX: 0 };

export function setGlobeRotY(v) { globeRotY = v; }
export function setGlobeRotX(v) { globeRotX = v; }
export function setGlobeZoom(v) { globeZoom = v; }

export let earthTextureImage = null;
export function setEarthTexture(img) { earthTextureImage = img; }

export let STAR_CATALOG = [];
export function setStarCatalog(c) { STAR_CATALOG = c; }

export let celestialBodies = null;
export let celestialEpoch = 0;
export function setCelestialBodies(b) { celestialBodies = b; }
export function getCelestialEpoch() { return celestialEpoch; }
export function setCelestialEpoch(e) { celestialEpoch = e; }
