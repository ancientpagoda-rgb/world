import { writeFile } from "node:fs/promises";

const SOURCE_URL = "https://unpkg.com/visionscarto-world-atlas@0.0.4/world/50m_countries.geojson";
const OUTPUT_FILE = "world-geometry.json";

function simplifyRing(ring) {
  if (!Array.isArray(ring) || ring.length < 3) return [];
  const step = ring.length > 180 ? 8 : ring.length > 96 ? 5 : ring.length > 36 ? 3 : 1;
  const simplified = [];
  for (let index = 0; index < ring.length; index += step) simplified.push(ring[index]);
  const last = ring[ring.length - 1];
  const first = simplified[0];
  if (simplified.length && (first[0] !== last[0] || first[1] !== last[1])) simplified.push(last);
  return simplified;
}

function simplifyGeometry(geometry) {
  if (!geometry) return null;
  if (geometry.type === "Polygon") {
    return { type: "Polygon", coordinates: geometry.coordinates.map(simplifyRing) };
  }
  if (geometry.type === "MultiPolygon") {
    return {
      type: "MultiPolygon",
      coordinates: geometry.coordinates.map((polygon) => polygon.map(simplifyRing)),
    };
  }
  return null;
}

const response = await fetch(SOURCE_URL);
if (!response.ok) throw new Error(`World geometry request failed: ${response.status}`);
const source = await response.json();
if (!Array.isArray(source.features)) throw new Error("World geometry source has no features array");

const features = source.features
  .map((feature) => {
    const geometry = simplifyGeometry(feature.geometry);
    if (!geometry) return null;
    return {
      type: "Feature",
      properties: { iso_a3: feature.properties?.iso_a3 || "" },
      geometry,
    };
  })
  .filter(Boolean);

const output = { type: "FeatureCollection", features };
await writeFile(OUTPUT_FILE, `${JSON.stringify(output)}\n`, "utf8");
console.log(`Wrote ${OUTPUT_FILE}: ${features.length} features, ${Buffer.byteLength(JSON.stringify(output))} bytes`);
