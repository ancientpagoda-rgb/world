import {
  WEATHER_API_BASE,
  weatherOrbState,
} from "./state.js";

function hash2D(x, y) {
  let h = x * 374761393 + y * 668265263;
  h = (h ^ (h >> 13)) * 1274126177;
  return (h ^ (h >> 16)) / 4294967296;
}

function smoothNoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const v00 = hash2D(ix, iy), v10 = hash2D(ix + 1, iy);
  const v01 = hash2D(ix, iy + 1), v11 = hash2D(ix + 1, iy + 1);
  return v00 + (v10 - v00) * sx + (v01 - v00) * sy + (v11 - v10 - v01 + v00) * sx * sy;
}

export function buildWeatherGridCoordinates() {
  const coords = [];
  for (let lat = -80; lat <= 80; lat += 20) {
    for (let lon = -180; lon < 180; lon += 20) {
      coords.push({ lat, lon });
    }
  }
  return coords;
}

function getGridKey(lat, lon) {
  return `${Math.round(lat / 10) * 10},${Math.round(lon / 10) * 10}`;
}

function snapLatitude(lat) {
  const snapped = Math.round(lat / 10) * 10;
  return Math.max(-80, Math.min(80, snapped));
}

function snapLongitude(lon) {
  let snapped = Math.round(lon / 10) * 10;
  if (snapped >= 180) snapped -= 360;
  if (snapped < -180) snapped += 360;
  return snapped;
}

export function getWeatherLayerNodes() {
  const canvas = document.querySelector("#weather-orb");
  return { canvas };
}

export function sampleTemperature(latDeg, lonDeg, timeMs) {
  const n = smoothNoise(latDeg * 0.03 + 100, lonDeg * 0.03 + timeMs * 0.000002);
  return (n - 0.5) * 60;
}

export function sampleRainfall(latDeg, lonDeg, timeMs) {
  const n = smoothNoise(latDeg * 0.04 + 200, lonDeg * 0.04 + timeMs * 0.000003);
  return Math.max(0, (n - 0.35) * 6);
}

export function sampleClouds(latDeg, lonDeg, timeMs) {
  const n = smoothNoise(latDeg * 0.035 + 300, lonDeg * 0.035 + timeMs * 0.0000025);
  return Math.max(0, Math.min(1, (n - 0.3) * 1.8));
}

export function sampleWind(latDeg, lonDeg, timeMs) {
  const n1 = smoothNoise(latDeg * 0.025 + 400, lonDeg * 0.025 + timeMs * 0.000002);
  const n2 = smoothNoise(latDeg * 0.03 + 500, lonDeg * 0.03 + timeMs * 0.0000025);
  const speed = (n1 * 0.6 + 0.3);
  const dir = n2 * 360;
  const zonal = speed * Math.cos(dir * Math.PI / 180);
  const meridional = speed * Math.sin(dir * Math.PI / 180);
  return { speed, zonal, meridional };
}

function getTemperatureColor(value) {
  const t = Math.max(-30, Math.min(50, value));
  if (t < -10) return [30, 60, 180];
  if (t < 0) return [60, 100, 200];
  if (t < 10) return [100, 160, 220];
  if (t < 20) return [180, 210, 140];
  if (t < 30) return [240, 210, 100];
  if (t < 40) return [240, 160, 60];
  return [220, 80, 40];
}

function getRainColor(value) {
  const v = Math.min(value, 20);
  if (v < 0.5) return null;
  if (v < 2) return [100, 160, 220, 0.15];
  if (v < 5) return [80, 140, 220, 0.25];
  if (v < 10) return [60, 110, 220, 0.40];
  return [40, 80, 220, 0.55];
}

function getCloudColor(value) {
  const v = Math.min(value, 1);
  if (v < 0.1) return null;
  if (v < 0.3) return [220, 220, 230, 0.08];
  if (v < 0.5) return [200, 200, 210, 0.15];
  if (v < 0.7) return [180, 180, 200, 0.25];
  return [160, 160, 190, 0.35];
}

export function getLiveWeatherPoint(latDeg, lonDeg) {
  const key = getGridKey(latDeg, lonDeg);
  for (const g of weatherOrbState.gridData) {
    if (getGridKey(g.latitude, g.longitude) === key) return g;
  }
  return null;
}

export function interpolateGridField(latDeg, lonDeg, field) {
  const lat0 = snapLatitude(latDeg - 5);
  const lat1 = snapLatitude(latDeg + 5);
  const lon0 = snapLongitude(lonDeg - 5);
  const lon1 = snapLongitude(lonDeg + 5);
  const fy = (latDeg - lat0) / (lat1 - lat0);
  const fx = (lonDeg - lon0) / (lon1 - lon0);
  const v00 = sampleField(lat0, lon0, field);
  const v10 = sampleField(lat0, lon1, field);
  const v01 = sampleField(lat1, lon0, field);
  const v11 = sampleField(lat1, lon1, field);
  const clamp = (v) => Math.max(0, Math.min(1, v));
  const cfy = clamp(fy), cfx = clamp(fx);
  const top = v00 + (v10 - v00) * cfx;
  const bot = v01 + (v11 - v01) * cfx;
  return top + (bot - top) * cfy;
}

function sampleField(lat, lon, field) {
  const point = getLiveWeatherPoint(lat, lon);
  if (!point) return 0;
  const v = point.current?.[field];
  return v != null ? v : 0;
}

export function drawLayerField(ctx, layerKey, alpha, rotation, radius, centerX, centerY, timeMs) {
  if (!weatherOrbState.currentGrid && !weatherOrbState.nextGrid) return;
  // ... (will be filled from app.js extraction later)
}

export async function loadLiveWeatherGrid() {
  const coords = buildWeatherGridCoordinates();
  const batchSize = 50;
  const allData = [];
  for (let i = 0; i < coords.length; i += batchSize) {
    const batch = coords.slice(i, i + batchSize);
    const url = `${WEATHER_API_BASE}?latitude=${batch.map(c=>c.lat).join(",")}&longitude=${batch.map(c=>c.lon).join(",")}&current=temperature_2m,precipitation,cloud_cover,wind_speed_10m,wind_direction_10m,wind_u_component_10m,wind_v_component_10m&timezone=auto`;
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`Weather request failed: ${resp.status}`);
      const json = await resp.json();
      const responses = Array.isArray(json) ? json : [json];
      for (const response of responses) {
        if (response && Number.isFinite(response.latitude) && Number.isFinite(response.longitude)) {
          allData.push({
            latitude: response.latitude,
            longitude: response.longitude,
            current: response.current || response.current_weather || {},
          });
        }
      }
    } catch (_) {}
  }
  weatherOrbState.gridData = allData;
  weatherOrbState.weatherSource = "Open-Meteo";
  return allData;
}
