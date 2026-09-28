const populationFormatter = new Intl.NumberFormat("en-US");
const DATA_URL = "../world-data.json";
const GEOJSON_URL = "https://unpkg.com/visionscarto-world-atlas@0.0.4/world/50m_countries.geojson";

let countryShapes = null;
const PAGE_SIZE = 48;
let visibleLimit = PAGE_SIZE;

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const headlineTimeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatPublishedAt(value) {
  const date = new Date(value || "");
  return Number.isFinite(date.getTime()) ? headlineTimeFormatter.format(date) : "";
}

function simplifyRing(ring) {
  if (!Array.isArray(ring) || ring.length < 3) return [];
  const step = ring.length > 220 ? 4 : ring.length > 120 ? 3 : ring.length > 48 ? 2 : 1;
  const simplified = [];
  for (let index = 0; index < ring.length; index += step) {
    simplified.push(ring[index]);
  }
  const last = ring[ring.length - 1];
  const first = simplified[0];
  if (simplified.length && (first[0] !== last[0] || first[1] !== last[1])) {
    simplified.push(last);
  }
  return simplified;
}

function getCountryThumbnailDataURL(iso3, w, h) {
  const polygons = countryShapes?.get(iso3);
  if (!polygons || !polygons.length) return null;

  let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
  for (const polygon of polygons) {
    for (const ring of polygon) {
      for (const [lon, lat] of ring) {
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
        if (lon < minLon) minLon = lon;
        if (lon > maxLon) maxLon = lon;
      }
    }
  }
  if (minLat >= maxLat || minLon >= maxLon) return null;

  const pad = 3;
  const rangeLon = maxLon - minLon || 1;
  const rangeLat = maxLat - minLat || 1;
  const scale = Math.min((w - pad * 2) / rangeLon, (h - pad * 2) / rangeLat);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");

  const cx = w / 2, cy = h / 2;
  const midLon = (minLon + maxLon) / 2, midLat = (minLat + maxLat) / 2;

  for (const polygon of polygons) {
    for (const [ringIdx, ring] of polygon.entries()) {
      ctx.beginPath();
      let started = false;
      for (const [lon, lat] of ring) {
        const x = cx + (lon - midLon) * scale;
        const y = cy - (lat - midLat) * scale;
        if (!started) { ctx.moveTo(x, y); started = true; }
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      if (ringIdx === 0) {
        ctx.fillStyle = "rgba(180, 200, 220, 0.10)";
        ctx.fill();
      }
      ctx.strokeStyle = "rgba(180, 200, 220, 0.40)";
      ctx.lineWidth = 0.7;
      ctx.stroke();
    }
  }

  return canvas.toDataURL();
}

function renderCountries(countries) {
  const root = document.querySelector("#country-list");
  const items = [];

  countries.slice(0, visibleLimit).forEach((item, index) => {
    const desc = item.description || "";
    const descClamped = desc.length > 280 ? desc.slice(0, 277) + "..." : desc;
    const thumbUrl = getCountryThumbnailDataURL(item.iso3, 52, 39);
    const headline = item.headline || "No current headline available.";
    const headlineUrl = /^https:\/\//i.test(item.headlineUrl || "")
      ? item.headlineUrl
      : item.headline
        ? `https://news.google.com/search?q=${encodeURIComponent(item.headline)}`
        : "";
    const publishedAt = formatPublishedAt(item.headlinePublishedAt);
    items.push(`
        <article class="country-row">
          <div class="country-rank">#${index + 1}</div>
          <div class="country-thumb-wrap">${thumbUrl ? `<img class="country-thumb" src="${thumbUrl}" width="52" height="39" alt="">` : ""}</div>
          <div>
            <h2 class="country-headline">${escapeHtml(item.name)}</h2>
            <span class="country-code">${escapeHtml(item.iso3)}</span>
            <p class="country-news">${headlineUrl ? `<a href="${escapeHtml(headlineUrl)}" target="_blank" rel="noopener noreferrer nofollow">${escapeHtml(headline)}</a>` : escapeHtml(headline)}</p>
            ${publishedAt ? `<time class="headline-timestamp" datetime="${escapeHtml(item.headlinePublishedAt)}">Published ${escapeHtml(publishedAt)}</time>` : ""}
            ${descClamped ? `<p class="country-description">${escapeHtml(descClamped)}</p>` : ""}
          </div>
          <div class="country-population">
            ${populationFormatter.format(item.population)}
            <span>${escapeHtml(item.year)}</span>
          </div>
        </article>
      `);
  });

  root.innerHTML = items.join("");
  if (visibleLimit < countries.length) {
    const footer = document.createElement("div");
    footer.className = "country-list-footer";
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = `Show ${Math.min(PAGE_SIZE, countries.length - visibleLimit)} more countries`;
    button.addEventListener("click", () => {
      visibleLimit += PAGE_SIZE;
      renderCountries(countries);
    });
    footer.appendChild(button);
    root.appendChild(footer);
  }
}

function renderLoading() {
  const root = document.querySelector("#country-list");
  root.innerHTML = `
    <article class="country-row">
      <div class="country-rank">...</div>
      <div>
        <p class="country-headline">Loading</p>
      </div>
      <div class="country-population">...</div>
    </article>
  `;
}

function renderError() {
  const root = document.querySelector("#country-list");
  root.innerHTML = `
    <article class="country-row">
      <div class="country-rank">!</div>
      <div>
        <p class="country-headline">Could not load data.</p>
      </div>
      <div class="country-population">ERR</div>
    </article>
  `;
}

function preprocessWorldGeometry(geojson) {
  if (!geojson?.features) return;

  countryShapes = new Map();
  for (const feature of geojson.features) {
    const iso3 = feature.properties?.iso_a3;
    if (!iso3) continue;
    const geometry = feature.geometry;
    if (!geometry) continue;
    let polygons = [];
    if (geometry.type === "Polygon") {
      polygons = [geometry.coordinates.map(simplifyRing)];
    } else if (geometry.type === "MultiPolygon") {
      polygons = geometry.coordinates.map((poly) => poly.map(simplifyRing));
    }
    if (polygons.length) countryShapes.set(iso3, polygons);
  }
}

async function loadData() {
  renderLoading();

  try {
    const [geojsonRes, countriesRes] = await Promise.all([
      fetch(GEOJSON_URL),
      fetch(DATA_URL),
    ]);
    const [geojson, countries] = await Promise.all([
      geojsonRes.json(),
      countriesRes.json(),
    ]);
    preprocessWorldGeometry(geojson);
    renderCountries(countries);
  } catch (err) {
    console.error("Failed to load country data:", err);
    renderError();
  }
}

// Mount globe widget at top
if (typeof GlobeWidget !== "undefined") {
  GlobeWidget.mount("#globe-container", {
    height: 350,
    weather: false,
    borders: true,
    stars: true,
    nightLights: true,
    drag: true,
    starsUrl: "../stars.json",
  });
}

loadData();
