const populationFormatter = new Intl.NumberFormat("en-US");

// Surface runtime failures on-page (helps debug when the globe goes blank).
function reportFatal(err) {
  // Deduplicate and avoid spamming the build tag every frame.
  if (!reportFatal._seen) reportFatal._seen = new Set();
  if (!reportFatal._count) reportFatal._count = 0;
  try {
    const tag = document.getElementById("build-tag");
    const msg = err && typeof err === "object" && "stack" in err && err.stack ? String(err.stack) : String(err);
    if (reportFatal._seen.has(msg)) return;
    reportFatal._seen.add(msg);
    reportFatal._count += 1;
    const line = `\nERROR: ${msg}`;
    if (tag) {
      if (reportFatal._count <= 6) {
        tag.textContent = `${tag.textContent || ""}${line}`;
      } else if (reportFatal._count === 7) {
        tag.textContent = `${tag.textContent || ""}\nERROR: (more errors hidden)`;
      }
      return;
    }
    const el = document.createElement("div");
    el.style.cssText = "position:fixed;left:12px;right:12px;bottom:12px;z-index:9999;padding:10px 12px;border-radius:10px;background:rgba(80,0,0,0.65);color:rgba(255,235,235,0.92);font:12px/1.35 'IBM Plex Mono',monospace;white-space:pre-wrap";
    el.textContent = `ERROR: ${msg}`;
    document.body.appendChild(el);
  } catch {
    // ignore
  }
}

window.addEventListener("error", (e) => reportFatal(e?.error || e?.message || e));
window.addEventListener("unhandledrejection", (e) => reportFatal(e?.reason || e));
const DATA_URL = "./world-data.json";
const WORLD_GEOJSON_URL = "https://unpkg.com/visionscarto-world-atlas@0.0.4/world/50m_countries.geojson";
// Weather grid is generated from NOAA GFS in CI and served as static JSON.
const NOAA_GRID_URL = "./noaa-weather-grid.json";
// Raster overlays are generated from the grid in CI.
const WEATHER_TEMP_RASTER_URL = "./weather-temp.png";
const WEATHER_PRECIP_RASTER_URL = "./weather-precip.png";
const WEATHER_RASTER_META_URL = "./weather-rasters.json";
// NOAA grid is already coarse; local cache avoids refetching on reloads.
const WEATHER_GRID_LAT_STEP = 20;
const WEATHER_GRID_LON_STEP = 20;
const WEATHER_GRID_LAT_MIN = -70;
const WEATHER_GRID_LAT_MAX = 70;
const WEATHER_CACHE_KEY = `world:noaa:grid:v1:${WEATHER_GRID_LAT_STEP}x${WEATHER_GRID_LON_STEP}`;
const WEATHER_CACHE_TTL_MS = 20 * 60 * 1000;

// --- Lo-fi tuning (lower contrast + less motion) ---
const LOFI_WEATHER_INTENSITY = 0.6; // 0..1
const LOFI_WIND_INTENSITY = 0.45; // 0..1
const LOFI_GLOW_INTENSITY = 0.75; // 0..1

// Make the temperature layer read a bit stronger.
const TEMP_OVERLAY_ALPHA_BASE = 0.10;
const TEMP_OVERLAY_ALPHA_RANGE = 0.16;

// Raster overlays can easily wash out the underlying satellite texture.
// Keep them more subtle than the point-sampled overlays.
const TEMP_RASTER_ALPHA_MUL = 0.45;
const PRECIP_RASTER_ALPHA_MUL = 0.85;

// Performance: cap internal resolution and cache expensive overlays.
const MAX_CANVAS_DPR = 1.25;
const WEATHER_OVERLAY_FPS = 6;

// Performance: starfield is full-screen, so keep it cheaper.
const STARFIELD_MAX_DPR = 0.9;
const STARFIELD_FPS = 20;

// Performance: quantize rotation for expensive per-pixel projections.
const TEXTURE_ROT_STEP = 0.03; // ~1.7 degrees

const DEVANAGARI_RE = /[\u0900-\u097F]/;
const HAN_RE = /[\u3400-\u9FFF\uF900-\uFAFF]/;
const PinyinProImportUrl = "https://esm.sh/pinyin-pro@3.26.0?bundle";
let pinyinProPromise = null;
const TONE_SUPERSCRIPTS = {
  "1": "¹",
  "2": "²",
  "3": "³",
  "4": "⁴",
};

const DA_ALFABET_TRANSLATOR = {
  core_chart: [
    { id: "trap_cat", ipa: "æ", da: "A", examples: ["and", "cat"], notes: "short A" },
    { id: "schwa", ipa: "ə", da: "Λ", examples: ["the", "about"], notes: "neutral vowel" },
    { id: "strut", ipa: "ʌ", da: "ƛ", examples: ["but", "stuck"], notes: "short U sound" },
    { id: "father_bar", ipa: "aːr", da: "À", examples: ["father", "bar"], notes: "R-colored broad A" },
    { id: "face_day", ipa: "eɪ", da: "A", examples: ["day", "bait"], notes: "duplicate DA symbol with /æ/" },
    { id: "air_chair", ipa: "eər", da: "Æ", examples: ["chair", "aeroplane"], notes: "air sound" },
    { id: "b", ipa: "b", da: "B", examples: ["about", "boat"], notes: "consonant" },
    { id: "d", ipa: "d", da: "D", examples: ["dig"], notes: "consonant" },
    { id: "eth", ipa: "ð", da: "Ð", examples: ["that", "them"], notes: "voiced TH" },
    { id: "dress_bed", ipa: "ɛ", da: "E", examples: ["bed", "egg"], notes: "short E" },
    { id: "fleece_see", ipa: "iː", da: "Ξ", examples: ["see", "cozy"], notes: "long EE" },
    { id: "nurse_bird", ipa: "ɜːr", da: "C", examples: ["nurse", "bird"], notes: "R-colored ER" },
    { id: "f", ipa: "f", da: "F", examples: ["frog"], notes: "consonant" },
    { id: "g", ipa: "g", da: "G", examples: ["go"], notes: "hard G" },
    { id: "h", ipa: "h", da: "H", examples: ["hat"], notes: "consonant" },
    { id: "kit_sit", ipa: "ɪ", da: "I", examples: ["it", "sing"], notes: "short I" },
    { id: "price_night", ipa: "aɪ", da: "Φ", examples: ["night", "sky"], notes: "eye sound" },
    { id: "choice_boy", ipa: "ɔɪ", da: "Ȯ", examples: ["boy", "oil"], notes: "oy sound" },
    { id: "j", ipa: "dʒ", da: "J", examples: ["jump", "age"], notes: "J sound" },
    { id: "ch", ipa: "tʃ", da: "Ҹ", examples: ["chip", "touch"], notes: "CH sound" },
    { id: "sh", ipa: "ʃ", da: "X", examples: ["shop", "squash"], notes: "SH sound" },
    { id: "zh", ipa: "ʒ", da: "Ʒ", examples: ["television", "measure"], notes: "ZH sound" },
    { id: "k", ipa: "k", da: "K", examples: ["tick", "come", "queen"], notes: "K sound" },
    { id: "l", ipa: "l", da: "L", examples: ["lamp", "sell"], notes: "consonant" },
    { id: "m", ipa: "m", da: "M", examples: ["mat"], notes: "consonant" },
    { id: "n", ipa: "n", da: "N", examples: ["now", "stun"], notes: "consonant" },
    { id: "ng", ipa: "ŋ", da: "Ŋ", examples: ["thing", "singing"], notes: "NG sound" },
    { id: "lot_stop", ipa: "ɒ", da: "O", examples: ["stop", "opera"], notes: "short O" },
    { id: "goat_boat", ipa: "əʊ", da: "Ω", examples: ["boat", "slow"], notes: "long O / OH" },
    { id: "thought_store", ipa: ["ɔːr", "ɔː"], da: "Ō", examples: ["store", "all"], notes: "AW / OR sound" },
    { id: "p", ipa: "p", da: "P", examples: ["pin", "apple"], notes: "consonant" },
    { id: "r", ipa: "r", da: "R", examples: ["run", "arrow"], notes: "consonant" },
    { id: "s", ipa: "s", da: "S", examples: ["city", "house"], notes: "S sound" },
    { id: "t", ipa: "t", da: "T", examples: ["top", "sit"], notes: "consonant" },
    { id: "goose_boot", ipa: "uː", da: "U", examples: ["boot", "suit"], notes: "long OO" },
    { id: "foot_put", ipa: "ʊ", da: "ʊ", examples: ["put", "could"], notes: "short OO" },
    { id: "v", ipa: "v", da: "V", examples: ["have", "very"], notes: "consonant" },
    { id: "w", ipa: "w", da: "W", examples: ["what", "way"], notes: "consonant" },
    { id: "mouth_cloud", ipa: "aʊ", da: "Ꝏ", examples: ["cloud", "power"], notes: "OW sound" },
    { id: "y", ipa: "j", da: "Y", examples: ["you"], notes: "Y consonant" },
    { id: "z", ipa: "z", da: "Z", examples: ["zoo", "buzz"], notes: "Z sound" },
    { id: "theta", ipa: "θ", da: "Þ", examples: ["thing", "maths"], notes: "voiceless TH" },
  ],
  universal_kit: {
    "ː": "long sound marker",
    "ʼ": "ejective or sharp release",
    "ʰ": "aspiration",
    "ʲ": "palatalization",
    "~": "nasalization",
    "1": "tone 1",
    "2": "tone 2",
    "3": "tone 3",
    "4": "tone 4",
    "ŋ": "velar nasal fallback",
    "ʃ": "sh fallback",
    "ʒ": "zh fallback",
    "x": "voiceless velar or uvular fricative",
    "q": "uvular stop",
    "ʔ": "glottal stop",
    "ü": "front rounded vowel",
    "ə": "schwa fallback",
    "ṛ": "retroflex or syllabic r",
    "ṭ": "retroflex t",
    "ḍ": "retroflex d",
    "ṇ": "retroflex n",
  },
};

const DA_REPLACEMENTS = [
  [/tion/g, "ʃən"],
  [/sion/g, "ʒən"],
  [/eər/g, "Æ"],
  [/ɔːr/g, "Ō"],
  [/ɜːr/g, "C"],
  [/aɪ/g, "Φ"],
  [/aʊ/g, "Ꝏ"],
  [/ɔɪ/g, "Ȯ"],
  [/əʊ/g, "Ω"],
  [/eɪ/g, "A"],
  [/iː/g, "Ξ"],
  [/uː/g, "U"],
  [/æ/g, "A"],
  [/ə/g, "Λ"],
  [/ʌ/g, "ƛ"],
  [/aːr/g, "À"],
  [/ð/g, "Ð"],
  [/θ/g, "Þ"],
  [/tʃ/g, "Ҹ"],
  [/dʒ/g, "J"],
  [/ʃ/g, "X"],
  [/ʒ/g, "Ʒ"],
  [/ŋ/g, "Ŋ"],
  [/ɒ/g, "O"],
  [/ʊ/g, "ʊ"],
  [/sh/g, "ʃ"],
  [/zh/g, "ʒ"],
  [/ch/g, "tʃ"],
  [/th/g, "θ"],
  [/ng/g, "ŋ"],
  [/kh/g, "x"],
  [/ph/g, "f"],
  [/qu/g, "kw"],
  [/ck/g, "k"],
  [/ee/g, "iː"],
  [/oo/g, "uː"],
  [/aa/g, "aː"],
  [/[áàâä]/g, "a"],
  [/[éèêë]/g, "e"],
  [/[íìîï]/g, "i"],
  [/[óòôö]/g, "o"],
  [/[úùû]/g, "u"],
  [/y/g, "Y"],
  [/j/g, "J"],
  [/c(?=[eiy])/g, "s"],
  [/c/g, "k"],
];

function applyReplacements(input, replacements) {
  let out = String(input);
  for (const [pattern, replacement] of replacements) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

function toDaCore(input = "") {
  return applyReplacements(
    String(input)
      .normalize("NFC")
      .toLowerCase(),
    DA_REPLACEMENTS,
  );
}

function toDaPresentation(input = "") {
  return applyReplacements(String(input), [
    [/iː/g, "ī"],
    [/uː/g, "ū"],
    [/aː/g, "ā"],
    [/eː/g, "ē"],
    [/oː/g, "ō"],
    [/ṛː/g, "ṝ"],
    [/ḷː/g, "ḹ"],
    [/1/g, TONE_SUPERSCRIPTS["1"]],
    [/2/g, TONE_SUPERSCRIPTS["2"]],
    [/3/g, TONE_SUPERSCRIPTS["3"]],
    [/4/g, TONE_SUPERSCRIPTS["4"]],
  ]);
}

function transliterateDevanagari(input = "") {
  const vowels = {
    "अ": "a",
    "आ": "aː",
    "इ": "i",
    "ई": "iː",
    "उ": "u",
    "ऊ": "uː",
    "ऋ": "ṛ",
    "ॠ": "ṛː",
    "ऌ": "ḷ",
    "ॡ": "ḷː",
    "ए": "e",
    "ऐ": "ai",
    "ओ": "o",
    "औ": "au",
  };
  const consonants = {
    "क": "k",
    "ख": "kʰ",
    "ग": "g",
    "घ": "gʰ",
    "ङ": "ŋ",
    "च": "tʃ",
    "छ": "tʃʰ",
    "ज": "dʒ",
    "झ": "dʒʰ",
    "ञ": "nʲ",
    "ट": "ṭ",
    "ठ": "ṭʰ",
    "ड": "ḍ",
    "ढ": "ḍʰ",
    "ण": "ṇ",
    "त": "t",
    "थ": "tʰ",
    "द": "d",
    "ध": "dʰ",
    "न": "n",
    "प": "p",
    "फ": "pʰ",
    "ब": "b",
    "भ": "bʰ",
    "म": "m",
    "य": "y",
    "र": "r",
    "ल": "l",
    "व": "v",
    "श": "ʃ",
    "ष": "ʃ",
    "स": "s",
    "ह": "h",
    "ळ": "ḷ",
  };
  const nuktaConsonants = {
    "क": "q",
    "ख": "x",
    "ग": "g",
    "ज": "z",
    "ड": "ṛ",
    "ढ": "ṛʰ",
    "फ": "f",
    "य": "y",
  };
  const matras = {
    "ा": "aː",
    "ि": "i",
    "ी": "iː",
    "ु": "u",
    "ू": "uː",
    "ृ": "ṛ",
    "ॄ": "ṛː",
    "ॅ": "e",
    "े": "e",
    "ै": "ai",
    "ॉ": "o",
    "ो": "o",
    "ौ": "au",
    "ॆ": "e",
    "ॊ": "o",
  };
  const signs = {
    "ं": "~",
    "ँ": "~",
    "ः": "h",
    "ऽ": "ʔ",
  };

  let out = "";
  for (let i = 0; i < String(input).length; i += 1) {
    const ch = input[i];
    const next = input[i + 1];
    const next2 = input[i + 2];

    if (vowels[ch]) {
      out += vowels[ch];
      continue;
    }
    if (signs[ch]) {
      out += signs[ch];
      continue;
    }
    if (ch === "्") {
      continue;
    }
    if (ch === "़") {
      continue;
    }

    const baseConsonant = consonants[ch];
    if (baseConsonant) {
      let rendered = baseConsonant;
      const isNukta = next === "़";
      const nextMark = isNukta ? next2 : next;
      if (isNukta && nuktaConsonants[ch]) {
        rendered = nuktaConsonants[ch];
      }
      if (nextMark === "्") {
        out += rendered;
        continue;
      }
      if (matras[nextMark]) {
        out += rendered + matras[nextMark];
        if (isNukta) i += 1;
        i += 1;
        continue;
      }
      out += rendered + "a";
      if (isNukta) i += 1;
      continue;
    }
    if (matras[ch]) {
      out += matras[ch];
      continue;
    }
    out += ch;
  }
  return toDaPresentation(toDaCore(out));
}

async function loadPinyinPro() {
  if (!pinyinProPromise) {
    pinyinProPromise = import(PinyinProImportUrl).catch((err) => {
      pinyinProPromise = null;
      throw err;
    });
  }
  return pinyinProPromise;
}

async function transliterateChinese(input = "") {
  try {
    const mod = await loadPinyinPro();
    const pinyin = mod.pinyin || mod.default?.pinyin || mod.default;
    if (typeof pinyin === "function") {
      const romanized = pinyin(String(input), {
        toneType: "num",
        nonZh: "consecutive",
      });
      const normalized = applyReplacements(String(romanized).toLowerCase(), [
        [/([jqxy])uan/g, "$1üan"],
        [/([jqxy])ue/g, "$1üe"],
        [/([jqxy])un/g, "$1ün"],
        [/([jqxy])u/g, "$1ü"],
        [/zh/g, "ʒ"],
        [/ch/g, "tʃʰ"],
        [/sh/g, "ʃ"],
        [/q/g, "tʃʰ"],
        [/x/g, "ʃ"],
        [/j/g, "dʒ"],
        [/c/g, "tʃʰ"],
      ]);
      return toDaPresentation(toDaCore(normalized));
    }
  } catch (err) {
    console.warn("Chinese transliteration fallback:", err);
  }
  return toDaPresentation(toDaCore(input));
}

async function toDaDisplay(input = "", language = "") {
  const text = String(input || "");
  if (!text) return "";
  if (language === "hi" || DEVANAGARI_RE.test(text)) {
    return transliterateDevanagari(text);
  }
  if (language === "zh" || HAN_RE.test(text)) {
    return transliterateChinese(text);
  }
  return toDaCore(text);
}

const STARS_URL = "./stars.json";
const STAR_CATALOG = [];

async function loadStarCatalog() {
  try {
    const res = await fetch(STARS_URL);
    const data = await res.json();
    for (const s of data) {
      if (s.m < -20) continue; // skip Sun
      STAR_CATALOG.push({
        ra: s.ra,
        dec: s.dec,
        size: Math.max(0.25, 2.8 - s.m * 0.38),
        baseAlpha: Math.max(0.07, 1.0 - s.m * 0.14),
        r: s.r, g: s.g, b: s.b,
        phase: (s.ra * 13.7 + s.dec * 7.3) % 6.2832,
        speed: 0.3 + (s.m % 1) * 1.2,
      });
    }
  } catch (e) {
    console.warn("Failed to load star catalog", e);
  }
}

// --- Satellite earth texture ---
const EARTH_TEXTURE_URL = "./earth-live.jpg";
const EARTH_TEXTURE_META_URL = "./earth-live.json";
const EARTH_SNAPSHOT_ENDPOINT = "https://wvs.earthdata.nasa.gov/api/v1/snapshot";
const EARTH_SNAPSHOT_LOOKBACK_DAYS = 7;
const EARTH_SNAPSHOT_TIMEOUT_MS = 10000;
const EARTH_LIVE_LAYER_CANDIDATES = [
  "OCI_PACE_True_Color",
  "VIIRS_NOAA21_CorrectedReflectance_TrueColor",
  "VIIRS_NOAA20_CorrectedReflectance_TrueColor",
  "VIIRS_SNPP_CorrectedReflectance_TrueColor",
  "MODIS_Aqua_CorrectedReflectance_TrueColor",
  "MODIS_Terra_CorrectedReflectance_TrueColor",
];
const NIGHT_TEXTURE_URL = "https://unpkg.com/three-globe@2.31.0/example/img/earth-night.jpg";
const earthTexture = { img: null };
const nightTexture = { img: null };
const debugState = {
  earthImgLoaded: false,
  earthImgError: null,
  earthPixelsReadable: false,
  earthPixelsError: null,
  earthImgDims: "",
  earthUrl: "",
  earthSource: "none",
  earthRenderMode: "none",
  tempRasterLoaded: false,
  precipRasterLoaded: false,
};

let _earthData = null, _nightData = null;
let _earthCache = { offscreen: null, r: 0, rotY: null, rotX: null };
let _nightCache = { offscreen: null, r: 0, rotY: null, rotX: null };
let _earthPriority = -1;

function setEarthTextureFromImage(img, priority, sourceLabel, sourceUrl) {
  if (priority < _earthPriority) return;
  _earthPriority = priority;
  earthTexture.img = img;
  debugState.earthImgLoaded = true;
  debugState.earthImgError = null;
  debugState.earthSource = sourceLabel;
  debugState.earthUrl = sourceUrl;

  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  const cx = c.getContext("2d");
  cx.drawImage(img, 0, 0);
  try {
    _earthData = cx.getImageData(0, 0, img.width, img.height);
    debugState.earthPixelsReadable = true;
    debugState.earthPixelsError = null;
  } catch {
    // If the canvas becomes tainted for any reason, fall back to the shaded sphere.
    _earthData = null;
    debugState.earthPixelsReadable = false;
    debugState.earthPixelsError = "getImageData failed (tainted?)";
  }
}

function loadImageIntoEarthTexture(url, priority, sourceLabel, objectUrlToRevoke = null) {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    setEarthTextureFromImage(img, priority, sourceLabel, url);
    debugState.earthImgDims = `${img.naturalWidth || img.width}x${img.naturalHeight || img.height}`;
    if (objectUrlToRevoke) URL.revokeObjectURL(objectUrlToRevoke);
  };
  img.onerror = () => {
    if (objectUrlToRevoke) URL.revokeObjectURL(objectUrlToRevoke);
    if (priority >= _earthPriority) {
      if (priority === 0) {
        debugState.earthImgLoaded = false;
        debugState.earthImgError = "fallback image load failed";
      } else if (_earthPriority === 0) {
        debugState.earthImgError = "live snapshot unavailable; using fallback";
      } else {
        debugState.earthImgError = "live snapshot load failed";
      }
    }
  };
  img.src = url;
  return img;
}

async function tryLoadLiveEarthTexture() {
  const now = new Date();
  for (let back = 0; back < EARTH_SNAPSHOT_LOOKBACK_DAYS; back++) {
    const day = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - back,
    )).toISOString().slice(0, 10);

    for (const layer of EARTH_LIVE_LAYER_CANDIDATES) {
      const params = new URLSearchParams({
        REQUEST: "GetSnapshot",
        LAYERS: layer,
        CRS: "EPSG:4326",
        BBOX: "-90,-180,90,180",
        FORMAT: "image/jpeg",
        WIDTH: "1024",
        HEIGHT: "512",
        TIME: day,
      });
      const url = `${EARTH_SNAPSHOT_ENDPOINT}?${params.toString()}`;
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), EARTH_SNAPSHOT_TIMEOUT_MS);

      try {
        const response = await fetch(url, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) continue;

        const dataPresent = response.headers.get("data-present");
        if (dataPresent && dataPresent.toLowerCase() !== "true") continue;

        const blob = await response.blob();
        if (!blob.size) continue;

        const objectUrl = URL.createObjectURL(blob);
        loadImageIntoEarthTexture(objectUrl, 1, `live ${layer} ${day}`, objectUrl);
        return true;
      } catch {
        // Try the next layer/day.
      } finally {
        window.clearTimeout(timeout);
      }
    }
  }

  return false;
}

function loadEarthTexture() {
  // Start with the CI-built fallback so the globe renders immediately, then
  // replace it with the freshest NASA Worldview snapshot we can fetch.
  let fallbackVersion = String(Date.now());
  fetch(EARTH_TEXTURE_META_URL, { cache: "no-store" })
    .then((r) => r.json())
    .then((meta) => {
      fallbackVersion = typeof meta?.generatedAt === "string" && meta.generatedAt
        ? meta.generatedAt
        : typeof meta?.acquisitionTime === "string" && meta.acquisitionTime
          ? meta.acquisitionTime
          : fallbackVersion;
    })
    .catch(() => {
      // Keep the timestamp fallback.
    })
    .finally(() => {
      const fallbackUrl = `${EARTH_TEXTURE_URL}?v=${encodeURIComponent(fallbackVersion)}`;
      loadImageIntoEarthTexture(fallbackUrl, 0, "fallback asset");
    });

    // Fire and forget the live path. If it succeeds, it takes over.
  tryLoadLiveEarthTexture().catch(() => {});
}

function loadNightTexture() {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    nightTexture.img = img;
    const c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    const cx = c.getContext("2d");
    cx.drawImage(img, 0, 0);
    try {
      _nightData = cx.getImageData(0, 0, img.width, img.height);
    } catch {
      _nightData = null;
    }
  };
  img.onerror = () => { nightTexture.img = null; };
  img.src = NIGHT_TEXTURE_URL;
}

// --- Weather raster overlays (generated by CI) ---
const weatherRaster = {
  temp: { img: null },
  precip: { img: null },
};

let _tempRasterData = null;
let _precipRasterData = null;
let _tempRasterCache = { offscreen: null, r: 0, rotY: null, rotX: null };
let _precipRasterCache = { offscreen: null, r: 0, rotY: null, rotX: null };

function loadWeatherRasters() {
  const load = (url, target, onData) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      target.img = img;
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const cx = c.getContext("2d");
      cx.drawImage(img, 0, 0);
      try {
        onData(cx.getImageData(0, 0, img.width, img.height));
      } catch {
        onData(null);
      }
    };
    img.onerror = () => {
      target.img = null;
      onData(null);
    };
    img.src = url;
  };

  // Use meta as a cache-buster so GitHub Pages updates show up without a hard refresh.
  fetch(WEATHER_RASTER_META_URL, { cache: "no-store" })
    .then((r) => r.json())
    .then((meta) => {
      const v = typeof meta?.validTime === "string" && meta.validTime
        ? meta.validTime
        : typeof meta?.generatedAt === "string" && meta.generatedAt
          ? meta.generatedAt
          : String(Date.now());
      const ver = encodeURIComponent(v);
      load(`${WEATHER_TEMP_RASTER_URL}?v=${ver}`, weatherRaster.temp, (d) => { _tempRasterData = d; debugState.tempRasterLoaded = !!d; });
      load(`${WEATHER_PRECIP_RASTER_URL}?v=${ver}`, weatherRaster.precip, (d) => { _precipRasterData = d; debugState.precipRasterLoaded = !!d; });
    })
    .catch(() => {
      load(WEATHER_TEMP_RASTER_URL, weatherRaster.temp, (d) => { _tempRasterData = d; debugState.tempRasterLoaded = !!d; });
      load(WEATHER_PRECIP_RASTER_URL, weatherRaster.precip, (d) => { _precipRasterData = d; debugState.precipRasterLoaded = !!d; });
    });
}

function rastersEnabled() {
  try {
    // Default to the point-sampled layers (the look you get with ?rasters=0).
    // Raster overlays are opt-in because they can wash out the base satellite texture.
    return new URLSearchParams(location.search).get("rasters") === "1";
  } catch {
    return false;
  }
}

function drawDebugHud(ctx, canvas) {
  const tag = document.getElementById("build-tag")?.textContent || "";
  const lines = [
    tag,
    debugState.earthUrl ? `earth: ${debugState.earthUrl}` : "earth: (no url)",
    `earth source: ${debugState.earthSource}`,
    debugState.earthImgDims ? `earth dims: ${debugState.earthImgDims}` : "earth dims: (unknown)",
    `earth img loaded: ${debugState.earthImgLoaded ? "yes" : "no"}${debugState.earthImgError ? ` (${debugState.earthImgError})` : ""}`,
    `earth pixels readable: ${debugState.earthPixelsReadable ? "yes" : "no"}${debugState.earthPixelsError ? ` (${debugState.earthPixelsError})` : ""}`,
    `earth render: ${debugState.earthRenderMode}`,
    `weather rasters: temp=${debugState.tempRasterLoaded ? "yes" : "no"} precip=${debugState.precipRasterLoaded ? "yes" : "no"}`,
    `rasters enabled: ${rastersEnabled() ? "yes" : "no"}`,
  ].filter(Boolean);

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.font = "12px 'IBM Plex Mono', monospace";
  ctx.textBaseline = "top";
  const padX = 12;
  const padY = 34;
  const lh = 15;
  const maxW = Math.min(canvas.width - padX * 2, 900);
  const boxH = lines.length * lh + 10;
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(padX - 8, padY - 6, maxW, boxH);
  ctx.fillStyle = "rgba(210,230,255,0.78)";
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], padX, padY + i * lh);
  }

  // Thumbnail: prove the satellite image is drawable in-canvas.
  if (earthTexture.img) {
    const tw = 180;
    const th = 90;
    const tx = Math.max(padX + 520, canvas.width - (tw + 16));
    const ty = padY;
    ctx.globalAlpha = 0.9;
    ctx.drawImage(earthTexture.img, tx, ty, tw, th);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "rgba(210,230,255,0.35)";
    ctx.lineWidth = 1;
    ctx.strokeRect(tx, ty, tw, th);
  }
  ctx.restore();
}

function _renderTexture3DAlpha(cache, data, ctx, cx, cy, r, rotY, rotX, alphaMul) {
  if (!data) return;
  const size = r * 2;
  if (cache.r === r && cache.rotY === rotY && cache.rotX === rotX && cache.offscreen) {
    ctx.drawImage(cache.offscreen, cx - r, cy - r);
    return;
  }
  if (!cache.offscreen || cache.offscreen.width !== size) {
    cache.offscreen = document.createElement("canvas");
    cache.offscreen.width = size;
    cache.offscreen.height = size;
  }
  const octx = cache.offscreen.getContext("2d");
  const imgData = octx.createImageData(size, size);
  const pixels = imgData.data;
  const d = data.data, iw = data.width, ih = data.height;
  const cY = Math.cos(-rotY), sY = Math.sin(-rotY);
  const cX = Math.cos(-rotX), sX = Math.sin(-rotX);
  const invR = 1 / r;
  const aMul = Number.isFinite(alphaMul) ? alphaMul : 1;

  for (let dy = 0; dy < size; dy++) {
    for (let dx = 0; dx < size; dx++) {
      const px = (dx - r) * invR, py = (dy - r) * invR;
      const r2 = px * px + py * py;
      if (r2 > 1) continue;
      const pz = Math.sqrt(1 - r2);
      const x1 = px;
      const y1 = py * cX - pz * sX;
      const z1 = py * sX + pz * cX;
      const x2 = x1 * cY + z1 * sY;
      const y2 = y1;
      const z2 = -x1 * sY + z1 * cY;
      const lat = Math.asin(Math.max(-1, Math.min(1, y2)));
      const lon = Math.atan2(x2, z2);
      const u = ((lon / (2 * Math.PI)) % 1 + 1) % 1;
      const v = 0.5 + lat / Math.PI;
      const si = Math.round(u * (iw - 1));
      const sj = Math.round(v * (ih - 1));
      const ii = (sj * iw + si) * 4;
      const pi = (dy * size + dx) * 4;
      const a = d[ii + 3];
      if (a === 0) continue;
      pixels[pi] = d[ii];
      pixels[pi + 1] = d[ii + 1];
      pixels[pi + 2] = d[ii + 2];
      pixels[pi + 3] = Math.max(0, Math.min(255, Math.round(a * aMul)));
    }
  }
  octx.putImageData(imgData, 0, 0);
  cache.r = r;
  cache.rotY = rotY;
  cache.rotX = rotX;
  ctx.drawImage(cache.offscreen, cx - r, cy - r);
}

function renderWeatherTempRaster(ctx, cx, cy, r, rotY, rotX) {
  if (_tempRasterData) _renderTexture3DAlpha(
    _tempRasterCache,
    _tempRasterData,
    ctx,
    cx,
    cy,
    r,
    rotY,
    rotX,
    TEMP_RASTER_ALPHA_MUL * LOFI_WEATHER_INTENSITY,
  );
}

function renderWeatherPrecipRaster(ctx, cx, cy, r, rotY, rotX) {
  if (_precipRasterData) _renderTexture3DAlpha(
    _precipRasterCache,
    _precipRasterData,
    ctx,
    cx,
    cy,
    r,
    rotY,
    rotX,
    PRECIP_RASTER_ALPHA_MUL * LOFI_WEATHER_INTENSITY,
  );
}

function _renderTexture3D(cache, data, ctx, cx, cy, r, rotY, rotX) {
  if (!data) return;
  const size = r * 2;
  if (cache.r === r && cache.rotY === rotY && cache.rotX === rotX && cache.offscreen) {
    ctx.drawImage(cache.offscreen, cx - r, cy - r);
    return;
  }
  if (!cache.offscreen || cache.offscreen.width !== size) {
    cache.offscreen = document.createElement("canvas");
    cache.offscreen.width = size;
    cache.offscreen.height = size;
  }
  const octx = cache.offscreen.getContext("2d");
  const imgData = octx.createImageData(size, size);
  const pixels = imgData.data;
  const d = data.data, iw = data.width, ih = data.height;
  // Slight lift so the satellite texture reads better on dark themes.
  const boost = 1.08;
  const lift = 6;
  const cY = Math.cos(-rotY), sY = Math.sin(-rotY);
  const cX = Math.cos(-rotX), sX = Math.sin(-rotX);
  const invR = 1 / r;
  for (let dy = 0; dy < size; dy++) {
    for (let dx = 0; dx < size; dx++) {
      const px = (dx - r) * invR, py = (dy - r) * invR;
      const r2 = px * px + py * py;
      if (r2 > 1) continue;
      const pz = Math.sqrt(1 - r2);
      const x1 = px;
      const y1 = py * cX - pz * sX;
      const z1 = py * sX + pz * cX;
      const x2 = x1 * cY + z1 * sY;
      const y2 = y1;
      const z2 = -x1 * sY + z1 * cY;
      const lat = Math.asin(Math.max(-1, Math.min(1, y2)));
      const lon = Math.atan2(x2, z2);
      const u = ((lon / (2 * Math.PI)) % 1 + 1) % 1;
      const v = 0.5 + lat / Math.PI;
      const si = Math.round(u * (iw - 1));
      const sj = Math.round(v * (ih - 1));
      const ii = (sj * iw + si) * 4;
      const pi = (dy * size + dx) * 4;
      const rr = Math.min(255, d[ii] * boost + lift);
      const gg = Math.min(255, d[ii + 1] * boost + lift);
      const bb = Math.min(255, d[ii + 2] * boost + lift);
      pixels[pi] = rr;
      pixels[pi + 1] = gg;
      pixels[pi + 2] = bb;
      pixels[pi + 3] = 255;
    }
  }
  octx.putImageData(imgData, 0, 0);
  cache.r = r;
  cache.rotY = rotY;
  cache.rotX = rotX;
  ctx.drawImage(cache.offscreen, cx - r, cy - r);
}

function renderEarthTexture(ctx, cx, cy, r, rotY, rotX) {
  if (_earthData) {
    debugState.earthRenderMode = "pixels";
    _renderTexture3D(_earthCache, _earthData, ctx, cx, cy, r, rotY, rotX);
    return;
  }

  // If the image loaded but the canvas is tainted (can't read pixels),
  // at least draw a simple cylindrical projection so we still show imagery.
  if (earthTexture.img) {
    debugState.earthRenderMode = "image";
    const img = earthTexture.img;
    const iw = img.width;
    const ih = img.height;

    // Extremely robust fallback: draw the equirectangular map clipped to a circle.
    // If getImageData() is blocked (tainted canvas) this still shows satellite imagery.
    // Note: ignores rotX and only approximates rotY.
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, 6.2832);
    ctx.clip();
    const scale = (2 * r) / ih;
    const drawW = iw * scale;
    const drawH = ih * scale;
    const ox = cx - drawW / 2;
    const oy = cy - drawH / 2;
    // Match the sign convention used by the per-pixel renderer (which uses -rotY).
    const turn = ((rotY / (2 * Math.PI)) % 1 + 1) % 1;
    const xShift = -turn * drawW;
    // Draw 3 copies to ensure full coverage regardless of shift.
    ctx.drawImage(img, ox + xShift - drawW, oy, drawW, drawH);
    ctx.drawImage(img, ox + xShift, oy, drawW, drawH);
    ctx.drawImage(img, ox + xShift + drawW, oy, drawW, drawH);
    ctx.restore();
    return;

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, 6.2832);
    ctx.clip();

    // Map lon -> x across the texture, lat -> y.
    // This is cheaper and avoids getImageData(), but ignores pitch rotation.
    let srcX = (((rotY + Math.PI / 2) % (2 * Math.PI)) / (2 * Math.PI)) * iw;
    if (srcX < 0) srcX += iw;
    srcX = Math.round(srcX);
    const halfIw = iw / 2;
    const wrap = srcX + halfIw > iw;

    const rI = Math.max(1, Math.round(r));
    for (let dy = -rI; dy <= rI; dy++) {
      const y = Math.round(cy + dy);
      const sinP = dy / r;
      if (Math.abs(sinP) >= 1) continue;
      const cosP = Math.cos(Math.asin(sinP));
      const sw = Math.round(2 * r * cosP);
      if (sw < 2) continue;
      const sy = Math.max(0, Math.min(ih - 1, Math.round(((Math.PI / 2 + Math.asin(sinP)) / Math.PI) * (ih - 1))));
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

    ctx.restore();
    return;
  }

  debugState.earthRenderMode = "fallback";

  // Fallback: simple shaded sphere so the globe doesn't become a flat dark disk
  // when the remote texture fails to load.
  const g = ctx.createRadialGradient(cx - r * 0.25, cy - r * 0.25, r * 0.15, cx, cy, r);
  g.addColorStop(0, "rgba(40, 95, 150, 0.40)");
  g.addColorStop(0.55, "rgba(14, 42, 70, 0.95)");
  g.addColorStop(1, "rgba(6, 16, 28, 1)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, 6.2832);
  ctx.fill();
}

function renderNightTexture(ctx, cx, cy, r, rotY, rotX) {
  if (_nightData) {
    _renderTexture3D(_nightCache, _nightData, ctx, cx, cy, r, rotY, rotX);
  }
}

// --- Solar system orbits (actual celestial positions) ---
const J2000_MS = Date.UTC(2000, 0, 1, 12, 0, 0);
const OBLIQUITY = 23.439292 * Math.PI / 180;

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function normalizeAngleRad(a) {
  a %= 2 * Math.PI;
  if (a < 0) a += 2 * Math.PI;
  return a;
}

function degToRad(d) {
  return d * Math.PI / 180;
}

function eqToUnitVec(ra, dec) {
  const cDec = Math.cos(dec);
  return {
    x: cDec * Math.sin(ra),
    y: Math.sin(dec),
    z: cDec * Math.cos(ra),
  };
}

function rotateVecToView(v, rotY, rotX) {
  // Matches the globe's latLonProjection orientation:
  // rotate around X (pitch) then around Y (yaw).
  const cX = Math.cos(rotX), sX = Math.sin(rotX);
  const y1 = v.y * cX + v.z * sX;
  const z1 = -v.y * sX + v.z * cX;
  const cY = Math.cos(rotY), sY = Math.sin(rotY);
  return {
    x: v.x * cY - z1 * sY,
    y: y1,
    z: v.x * sY + z1 * cY,
  };
}

const PLANET_ORBITS = [
  { name: 'Mercury', L: 252.250906, a: 0.387098, e: 0.205635, i: 7.004979, w: 77.457796, O: 48.330765, n: 4.092334, c: [210, 200, 180], s: 1.8 },
  { name: 'Venus',   L: 181.979801, a: 0.723332, e: 0.006772, i: 3.394662, w: 131.767557, O: 76.679843, n: 1.602130, c: [245, 235, 205], s: 3.5 },
  { name: 'Mars',    L: 355.453000, a: 1.523679, e: 0.093401, i: 1.849726, w: 336.060234, O: 49.558093, n: 0.524033, c: [230, 165, 125], s: 2.5 },
  { name: 'Jupiter', L: 34.351484,  a: 5.202603, e: 0.048498, i: 1.303267, w: 14.331309,  O: 100.464441, n: 0.083085, c: [225, 205, 170], s: 4.2 },
  { name: 'Saturn',  L: 49.317954,  a: 9.554909, e: 0.055546, i: 2.488879, w: 93.056787,  O: 113.665502, n: 0.033444, c: [215, 205, 175], s: 3.2 },
  { name: 'Uranus',  L: 313.232324, a: 19.218446, e: 0.046295, i: 0.773125, w: 173.005291, O: 74.005957, n: 0.011730, c: [180, 210, 230], s: 2.2 },
  { name: 'Neptune', L: 304.867234, a: 30.110387, e: 0.008986, i: 1.769953, w: 48.120276, O: 131.784226, n: 0.005981, c: [150, 185, 235], s: 2.0 },
];

const EARTH_ORBIT = { L: 100.466, a: 1.000001, e: 0.016708, i: 0, w: 282.938, O: 0, n: 0.9856 };

function heliocentricPos(d, body) {
  const M = ((body.L - body.w + body.n * d) % 360) * Math.PI / 180;
  let E = M;
  for (let i = 5; i--;)
    E -= (E - body.e * Math.sin(E) - M) / (1 - body.e * Math.cos(E));
  const xp = body.a * (Math.cos(E) - body.e);
  const yp = body.a * Math.sqrt(1 - body.e * body.e) * Math.sin(E);
  const wR = body.w * Math.PI / 180, OR = body.O * Math.PI / 180, iR = body.i * Math.PI / 180;
  const cW = Math.cos(wR), sW = Math.sin(wR), cO = Math.cos(OR), sO = Math.sin(OR), cI = Math.cos(iR), sI = Math.sin(iR);
  return {
    x: (cW * cO - sW * sO * cI) * xp + (-sW * cO - cW * sO * cI) * yp,
    y: (cW * sO + sW * cO * cI) * xp + (-sW * sO + cW * cO * cI) * yp,
    z: (sW * sI) * xp + (cW * sI) * yp,
  };
}

function eclipticToEq(lon, lat) {
  const sl = Math.sin(lon);
  return {
    ra: Math.atan2(sl * Math.cos(OBLIQUITY) - Math.tan(lat) * Math.sin(OBLIQUITY), Math.cos(lon)),
    dec: Math.asin(Math.sin(lat) * Math.cos(OBLIQUITY) + Math.cos(lat) * Math.sin(OBLIQUITY) * sl),
  };
}

// Geocentric Moon position (approximate; good enough for phase + general placement).
// Based on a compact subset of Meeus periodic terms.
function computeMoonGeocentricEq(d) {
  const Lp = degToRad(218.316 + 13.176396 * d);
  const M = degToRad(134.963 + 13.064993 * d);
  const D = degToRad(297.850 + 12.190749 * d);
  const F = degToRad(93.272 + 13.229350 * d);

  const lon =
    Lp +
    degToRad(6.289) * Math.sin(M) +
    degToRad(1.274) * Math.sin(2 * D - M) +
    degToRad(0.658) * Math.sin(2 * D) +
    degToRad(0.214) * Math.sin(2 * M) +
    degToRad(0.110) * Math.sin(D);

  const lat =
    degToRad(5.128) * Math.sin(F) +
    degToRad(0.280) * Math.sin(M + F) +
    degToRad(0.277) * Math.sin(M - F) +
    degToRad(0.173) * Math.sin(2 * D - F);

  const distKm =
    385001 -
    20905 * Math.cos(M) -
    3699 * Math.cos(2 * D - M) -
    2956 * Math.cos(2 * D) -
    570 * Math.cos(2 * M);

  const eq = eclipticToEq(lon, lat);
  eq.ra = normalizeAngleRad(eq.ra);
  return { ra: eq.ra, dec: eq.dec, distKm, eclLon: lon, eclLat: lat };
}

let celestialBodies = null;
let celestialEpoch = 0;

function computeCelestialBodies() {
  const d = (Date.now() - J2000_MS) / 86400000;
  const earth = heliocentricPos(d, EARTH_ORBIT);
  const bodies = [];

  const sgx = -earth.x, sgy = -earth.y, sgz = -earth.z;
  const sd = Math.sqrt(sgx * sgx + sgy * sgy + sgz * sgz);
  const sl = Math.atan2(sgy, sgx);
  const sa = Math.asin(sgz / sd);
  const se = eclipticToEq(sl, sa);
  if (se.ra < 0) se.ra += 2 * Math.PI;
  bodies.push({ name: 'Sun', ra: se.ra, dec: se.dec, c: [255, 245, 230], s: 28, sun: true });

  for (const p of PLANET_ORBITS) {
    const pos = heliocentricPos(d, p);
    const gx = pos.x - earth.x, gy = pos.y - earth.y, gz = pos.z - earth.z;
    const gd = Math.sqrt(gx * gx + gy * gy + gz * gz);
    const lon = Math.atan2(gy, gx);
    const lat = Math.asin(gz / gd);
    const eq = eclipticToEq(lon, lat);
    if (eq.ra < 0) eq.ra += 2 * Math.PI;
    bodies.push({ name: p.name, ra: eq.ra, dec: eq.dec, c: p.c, s: p.s });
  }

  return bodies;
}

function getCelestialBodies() {
  const now = Date.now();
  if (!celestialBodies || now - celestialEpoch > 600000) {
    celestialBodies = computeCelestialBodies();
    celestialEpoch = now;
  }
  return celestialBodies;
}

const CITIES = [
  [35.68, 139.65, 37], [34.69, 135.50, 19], [37.57, 126.98, 10],
  [31.23, 121.47, 28], [39.90, 116.41, 22], [23.13, 113.26, 25],
  [22.54, 114.06, 12], [25.03, 121.56, 8], [30.57, 104.07, 16],
  [29.56, 106.55, 15], [36.07, 120.38, 9], [45.75, 126.63, 11],
  [28.70, 77.10, 32], [19.08, 72.88, 21], [22.57, 88.36, 15],
  [12.97, 77.59, 12], [13.08, 80.27, 10], [17.39, 78.49, 9],
  [23.81, 90.41, 23], [24.86, 67.01, 16], [31.55, 74.34, 13],
  [33.68, 73.05, 2], [13.76, 100.50, 11], [14.60, 120.98, 14],
  [-6.21, 106.85, 11], [1.35, 103.82, 6], [10.82, 106.63, 9],
  [3.14, 101.69, 8], [16.84, 96.13, 5], [21.03, 105.85, 8],
  [41.01, 28.98, 15], [35.69, 51.39, 9], [33.32, 44.38, 7],
  [24.71, 46.68, 8], [25.20, 55.27, 3], [21.49, 39.19, 4],
  [30.04, 31.24, 22], [6.52, 3.38, 21],
  [55.76, 37.62, 12], [59.93, 30.34, 5], [50.45, 30.52, 3],
  [51.51, -0.13, 14], [48.86, 2.35, 11], [52.52, 13.41, 4],
  [40.42, -3.70, 6], [41.90, 12.50, 4], [45.46, 9.19, 3],
  [41.39, 2.17, 5], [52.37, 4.89, 2], [50.85, 4.35, 2],
  [48.21, 16.37, 2], [52.23, 21.01, 2], [38.72, -9.14, 3],
  [37.98, 23.73, 4], [53.35, -6.26, 2],
  [40.71, -74.01, 20], [34.05, -118.24, 13], [41.88, -87.63, 9],
  [43.65, -79.38, 6], [19.43, -99.13, 22], [20.68, -103.35, 5],
  [25.76, -80.19, 6], [29.76, -95.37, 7], [32.78, -96.81, 7],
  [42.36, -71.06, 5], [47.61, -122.33, 4], [49.28, -123.12, 3],
  [38.91, -77.04, 6], [33.75, -84.39, 6], [45.50, -73.57, 4],
  [-23.55, -46.63, 22], [-22.91, -43.17, 13], [-34.60, -58.38, 15],
  [-33.45, -70.65, 7], [-12.05, -77.04, 10], [4.71, -74.07, 11],
  [10.48, -66.90, 6], [-15.79, -47.86, 4], [-19.92, -43.94, 6],
  [-4.44, 15.27, 15], [-26.20, 28.05, 6], [-33.92, 18.42, 5],
  [-1.29, 36.82, 5], [9.03, 38.75, 5], [5.60, -0.19, 5],
  [14.72, -17.47, 4], [15.55, 32.53, 5],
  [-33.87, 151.21, 5], [-37.81, 144.96, 5], [-27.47, 153.03, 2],
  [-31.95, 115.86, 2],
];

const weatherOrbState = {
  features: [],
  loading: false,
  loaded: false,
  weatherGrid: new Map(),
  weatherTimestamp: "",
  weatherSource: "NOAA GFS grid (loading)",
};

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function lerp(start, end, t) {
  return start + (end - start) * t;
}

function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

function mixColor(a, b, t) {
  return [
    Math.round(lerp(a[0], b[0], t)),
    Math.round(lerp(a[1], b[1], t)),
    Math.round(lerp(a[2], b[2], t)),
  ];
}

function rgba(color, alpha) {
  return `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha})`;
}

function hash2D(x, y) {
  let n = x * 374761393 + y * 668265263;
  n = (n ^ (n >> 13)) * 1274126177;
  return ((n ^ (n >> 16)) & 0x7fffffff) / 0x7fffffff;
}

function smoothNoise(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  return lerp(lerp(hash2D(ix, iy), hash2D(ix + 1, iy), sx), lerp(hash2D(ix, iy + 1), hash2D(ix + 1, iy + 1), sx), sy);
}

function normalizeLongitude(lon) {
  let normalized = lon;
  while (normalized < -180) normalized += 360;
  while (normalized > 180) normalized -= 360;
  return normalized;
}

function getGridKey(lat, lon) {
  return `${lat}:${lon}`;
}

function snapLatitude(lat) {
  return clamp(
    Math.round(lat / WEATHER_GRID_LAT_STEP) * WEATHER_GRID_LAT_STEP,
    WEATHER_GRID_LAT_MIN,
    WEATHER_GRID_LAT_MAX,
  );
}

function snapLongitude(lon) {
  let snapped = Math.round(normalizeLongitude(lon) / WEATHER_GRID_LON_STEP) * WEATHER_GRID_LON_STEP;
  if (snapped >= 180) snapped -= 360;
  if (snapped < -180) snapped += 360;
  return snapped;
}

function getWeatherLayerNodes() {
  return {
    canvas: document.querySelector("#weather-orb-canvas"),
    name: document.querySelector("#weather-layer-name"),
    detail: document.querySelector("#weather-layer-detail"),
    source: document.querySelector("#weather-hud-source"),
    updated: document.querySelector("#weather-hud-updated"),
    temp: document.querySelector("#weather-hud-temp"),
    wind: document.querySelector("#weather-hud-wind"),
    rain: document.querySelector("#weather-hud-rain"),
  };
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
  if (
    simplified.length &&
    (first[0] !== last[0] || first[1] !== last[1])
  ) {
    simplified.push(last);
  }
  return simplified;
}

function preprocessWorldGeometry(geojson) {
  if (!geojson?.features) return [];

  return geojson.features
    .flatMap((feature) => {
      const geometry = feature?.geometry;
      if (!geometry) return [];
      if (geometry.type === "Polygon") return [geometry.coordinates.map(simplifyRing)];
      if (geometry.type === "MultiPolygon") {
        return geometry.coordinates.map((polygon) => polygon.map(simplifyRing));
      }
      return [];
    })
    .filter(Boolean);
}

async function loadWeatherGeometry() {
  if (weatherOrbState.loading || weatherOrbState.loaded) return;
  weatherOrbState.loading = true;

  try {
    const response = await fetch(WORLD_GEOJSON_URL);
    const geojson = await response.json();
    weatherOrbState.features = preprocessWorldGeometry(geojson);
    weatherOrbState.loaded = true;

    weatherOrbState.countryShapes = new Map();
    if (geojson?.features) {
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
        if (polygons.length) weatherOrbState.countryShapes.set(iso3, polygons);
      }
    }
  } catch (_error) {
    weatherOrbState.features = [];
    weatherOrbState.loaded = false;
  } finally {
    weatherOrbState.loading = false;
  }
}

async function loadNoaaWeatherGrid() {
  // Try cached grid first (keeps the page usable offline + avoids refetch loops).
  try {
    const cachedRaw = localStorage.getItem(WEATHER_CACHE_KEY);
    if (cachedRaw) {
      const cached = JSON.parse(cachedRaw);
      if (
        cached &&
        typeof cached.savedAtMs === "number" &&
        Date.now() - cached.savedAtMs < WEATHER_CACHE_TTL_MS &&
        Array.isArray(cached.entries)
      ) {
        const grid = new Map();
        for (const entry of cached.entries) {
          if (!entry || typeof entry.key !== "string" || typeof entry.value !== "object") continue;
          grid.set(entry.key, entry.value);
        }
        if (grid.size) {
          weatherOrbState.weatherGrid = grid;
          weatherOrbState.weatherTimestamp = typeof cached.timestamp === "string" ? cached.timestamp : "";
          weatherOrbState.weatherSource = "NOAA GFS grid (cached)";
          return;
        }
      }
    }
  } catch {
    // ignore cache corruption
  }

  const response = await fetch(NOAA_GRID_URL, { cache: "no-store" });
  const payload = await response.json();
  const rows = payload?.grid;
  if (!Array.isArray(rows)) {
    throw new Error("invalid NOAA grid payload");
  }

  const grid = new Map();
  for (const row of rows) {
    const lat = snapLatitude(row?.lat);
    const lon = snapLongitude(row?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    grid.set(getGridKey(lat, lon), {
      temperature: row.temperatureC,
      precipitation: row.precipMmPerHr,
      cloudCover: row.cloudCoverPct,
      windU: row.windU,
      windV: row.windV,
      // Keep these for potential HUD wiring later.
      windSpeed: row.windSpeed,
      windDirection: row.windDirection,
    });
  }

  if (!grid.size) {
    throw new Error("empty NOAA grid");
  }

  weatherOrbState.weatherGrid = grid;
  weatherOrbState.weatherTimestamp =
    typeof payload?.validTime === "string" ? payload.validTime : typeof payload?.generatedAt === "string" ? payload.generatedAt : "";
  weatherOrbState.weatherSource =
    typeof payload?.source === "string" ? payload.source : "NOAA GFS grid";

  try {
    localStorage.setItem(
      WEATHER_CACHE_KEY,
      JSON.stringify({
        savedAtMs: Date.now(),
        timestamp: weatherOrbState.weatherTimestamp,
        entries: Array.from(grid.entries()).map(([key, value]) => ({ key, value })),
      }),
    );
  } catch {
    // ignore quota / serialization errors
  }
}

function latLonProjection(latDeg, lonDeg, rotY, rotX) {
  const lat = (latDeg * Math.PI) / 180;
  const lon = (lonDeg * Math.PI) / 180;
  let x = Math.cos(lat) * Math.sin(lon);
  let y = Math.sin(lat);
  let z = Math.cos(lat) * Math.cos(lon);
  const cY = Math.cos(rotY), sY = Math.sin(rotY);
  const x1 = x * cY + z * sY;
  const y1 = y;
  const z1 = -x * sY + z * cY;
  const cX = Math.cos(rotX), sX = Math.sin(rotX);
  const x2 = x1;
  const y2 = y1 * cX - z1 * sX;
  const z2 = y1 * sX + z1 * cX;
  return { x: x2, y: y2, z: z2, lat, lon };
}

function sampleTemperature(latDeg, lonDeg, timeMs) {
  const v = interpolateGridField(latDeg, lonDeg, "temperature");
  if (v != null) return clamp((v + 35) / 80, 0, 1);
  const live = getLiveWeatherPoint(latDeg, lonDeg);
  if (live && typeof live.temperature === "number") return clamp((live.temperature + 35) / 80, 0, 1);
  return null;
}

function sampleRainfall(latDeg, lonDeg, timeMs) {
  const v = interpolateGridField(latDeg, lonDeg, "precipitation");
  if (v != null) return clamp(v / 5, 0, 1);
  const live = getLiveWeatherPoint(latDeg, lonDeg);
  if (live && typeof live.precipitation === "number") return clamp(live.precipitation / 5, 0, 1);
  return null;
}

function sampleClouds(latDeg, lonDeg, timeMs) {
  const v = interpolateGridField(latDeg, lonDeg, "cloudCover");
  if (v != null) return clamp(v / 100, 0, 1);
  const live = getLiveWeatherPoint(latDeg, lonDeg);
  if (live && typeof live.cloudCover === "number") return clamp(live.cloudCover / 100, 0, 1);
  return null;
}

function sampleWind(latDeg, lonDeg, timeMs) {
  const speed = interpolateGridField(latDeg, lonDeg, "windSpeed");
  const dir = interpolateGridField(latDeg, lonDeg, "windDirection");
  if (speed != null && dir != null) {
    const cs = clamp(speed / 18, 0.12, 1.2);
    const rad = ((dir + 180) * Math.PI) / 180;
    return { zonal: Math.sin(rad) * cs, meridional: Math.cos(rad) * cs, speed: cs };
  }
  const live = getLiveWeatherPoint(latDeg, lonDeg);
  if (live && typeof live.windSpeed === "number" && typeof live.windDirection === "number") {
    const cs = clamp(live.windSpeed / 18, 0.12, 1.2);
    const rad = ((live.windDirection + 180) * Math.PI) / 180;
    return { zonal: Math.sin(rad) * cs, meridional: Math.cos(rad) * cs, speed: cs };
  }
  return null;
}

function getLiveWindUV(latDeg, lonDeg) {
  const point = getLiveWeatherPoint(latDeg, lonDeg);
  if (point && typeof point.windU === "number" && typeof point.windV === "number") {
    return point;
  }
  return null;
}

function sampleWindUV(latDeg, lonDeg, timeMs) {
  const uGrid = interpolateGridField(latDeg, lonDeg, "windU");
  const vGrid = interpolateGridField(latDeg, lonDeg, "windV");
  if (uGrid != null && vGrid != null) {
    return { u: uGrid, v: vGrid, speed: Math.sqrt(uGrid * uGrid + vGrid * vGrid) };
  }
  const live = getLiveWindUV(latDeg, lonDeg);
  if (live) {
    return { u: live.windU, v: live.windV, speed: Math.sqrt(live.windU ** 2 + live.windV ** 2) };
  }
  const w = sampleWind(latDeg, lonDeg, timeMs);
  if (w) {
    return { u: w.zonal, v: w.meridional, speed: w.speed };
  }
  return null;
}

const WIND_LAYERS = [
  // Snapshot mode (option 1): surface winds only.
  { name: "surface", u: "windU", v: "windV", c: [160, 210, 255], a: 0.22, w: 0.55, count: 1100 },
];

const windLayerParticles = new Map();

function initWindParticles(count) {
  const p = [];
  for (let i = 0; i < count; i++) {
    p.push({ lat: Math.random() * 140 - 70, lon: Math.random() * 360 - 180, prevLat: 0, prevLon: 0, age: 0 });
  }
  return p;
}

function sampleWindUVLayer(latDeg, lonDeg, timeMs, layer) {
  const uGrid = interpolateGridField(latDeg, lonDeg, layer.u);
  const vGrid = interpolateGridField(latDeg, lonDeg, layer.v);
  if (uGrid != null && vGrid != null) {
    return { u: uGrid, v: vGrid, speed: Math.sqrt(uGrid * uGrid + vGrid * vGrid) };
  }
  // Only the surface layer has reasonable fallbacks.
  if (layer.name === "surface") return sampleWindUV(latDeg, lonDeg, timeMs);
  return null;
}

function drawWindLayer(ctx, rotY, rotX, radius, centerX, centerY, timeMs, layer) {
  let particles = windLayerParticles.get(layer.name);
  if (!particles) {
    particles = initWindParticles(layer.count);
    windLayerParticles.set(layer.name, particles);
  }

  const step = 0.26;
  for (const p of particles) {
    const wind = sampleWindUVLayer(p.lat, p.lon, timeMs, layer);
    if (!wind || wind.speed < 0.03) {
      p.lat = Math.random() * 140 - 70;
      p.lon = Math.random() * 360 - 180;
      p.prevLat = p.lat;
      p.prevLon = p.lon;
      p.age = 0;
      continue;
    }

    p.prevLat = p.lat;
    p.prevLon = p.lon;

    const lf = 1 / Math.cos(p.lat * Math.PI / 180 + 0.01);
    p.lat += wind.v * step * 0.07;
    p.lon += wind.u * step * 0.07 * lf;

    if (p.lon > 180) p.lon -= 360;
    if (p.lon < -180) p.lon += 360;
    if (Math.abs(p.lat) > 85) {
      p.lat = Math.random() * 140 - 70;
      p.lon = Math.random() * 360 - 180;
      p.prevLat = p.lat;
      p.prevLon = p.lon;
      p.age = 0;
      continue;
    }

    const pos = latLonProjection(p.lat, p.lon, rotY, rotX);
    const prevPos = latLonProjection(p.prevLat, p.prevLon, rotY, rotX);

    if (pos.z <= 0.01 || prevPos.z <= 0.01) {
      p.lat = Math.random() * 140 - 70;
      p.lon = Math.random() * 360 - 180;
      p.prevLat = p.lat;
      p.prevLon = p.lon;
      p.age = 0;
      continue;
    }

    const x = centerX + pos.x * radius;
    const y = centerY - pos.y * radius;
    const px = centerX + prevPos.x * radius;
    const py = centerY - prevPos.y * radius;

    const alpha = Math.min(layer.a, wind.speed * 0.07) * LOFI_WIND_INTENSITY;
    ctx.strokeStyle = rgba(layer.c, alpha);
    ctx.lineWidth = Math.max(0.3, wind.speed * layer.w);
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(x, y);
    ctx.stroke();

    p.age++;
  }
}

function drawWindParticles(ctx, rotY, rotX, radius, centerX, centerY, timeMs) {
  ctx.lineCap = "round";
  // Draw higher layers first, so the surface field reads on top.
  for (const layer of [...WIND_LAYERS].reverse()) {
    drawWindLayer(ctx, rotY, rotX, radius, centerX, centerY, timeMs, layer);
  }
}

function getTemperatureColor(value) {
  if (value < 0.2) return mixColor([30, 60, 180], [50, 130, 230], value / 0.2);
  if (value < 0.4) return mixColor([50, 130, 230], [80, 210, 240], (value - 0.2) / 0.2);
  if (value < 0.5) return mixColor([80, 210, 240], [160, 230, 140], (value - 0.4) / 0.1);
  if (value < 0.6) return mixColor([160, 230, 140], [230, 230, 100], (value - 0.5) / 0.1);
  if (value < 0.75) return mixColor([230, 230, 100], [240, 170, 70], (value - 0.6) / 0.15);
  if (value < 0.9) return mixColor([240, 170, 70], [230, 100, 60], (value - 0.75) / 0.15);
  return mixColor([230, 100, 60], [180, 40, 40], Math.min(1, (value - 0.9) / 0.1));
}

function getRainRadarColor(value) {
  if (value < 0.1) return null;
  // Softer alpha for a more lo-fi look.
  if (value < 0.2) return [[80, 200, 255], 0.05 * LOFI_WEATHER_INTENSITY];
  if (value < 0.35) return [[60, 230, 130], 0.09 * LOFI_WEATHER_INTENSITY];
  if (value < 0.5) return [[255, 235, 70], 0.14 * LOFI_WEATHER_INTENSITY];
  if (value < 0.7) return [[255, 150, 40], 0.18 * LOFI_WEATHER_INTENSITY];
  return [[255, 50, 50], 0.22 * LOFI_WEATHER_INTENSITY];
}
function getCloudColor(value) {
  return mixColor([110, 136, 156], [240, 247, 255], clamp(value, 0, 1));
}

function getLiveWeatherPoint(latDeg, lonDeg) {
  if (!weatherOrbState.weatherGrid.size) return null;
  const lat = snapLatitude(latDeg);
  const lon = snapLongitude(lonDeg);
  return weatherOrbState.weatherGrid.get(getGridKey(lat, lon)) || null;
}

function interpolateGridField(latDeg, lonDeg, field) {
  if (!weatherOrbState.weatherGrid.size) return null;
  const grid = weatherOrbState.weatherGrid;
  const step = WEATHER_GRID_LAT_STEP;

  const lat0 = snapLatitude(latDeg - step / 2);
  const lat1 = snapLatitude(latDeg + step / 2);
  const lon0 = snapLongitude(lonDeg - step / 2);
  const lon1 = snapLongitude(lonDeg + step / 2);

  if (lat0 === lat1 && lon0 === lon1) {
    const p = grid.get(getGridKey(lat0, lon0));
    return p ? p[field] ?? null : null;
  }

  const gv = (lat, lon) => {
    const p = grid.get(getGridKey(lat, lon));
    return p ? p[field] ?? null : null;
  };

  let fx, latT, latB;
  if (lat0 <= lat1) { fx = (latDeg - lat0) / (lat1 - lat0); latT = lat0; latB = lat1; }
  else { fx = (latDeg - lat1) / (lat0 - lat1); latT = lat1; latB = lat0; }
  fx = clamp(fx, 0, 1);

  let fy, lonL, lonR;
  if (lon0 <= lon1) { fy = (lonDeg - lon0) / (lon1 - lon0); lonL = lon0; lonR = lon1; }
  else { fy = (lonDeg - lon0) / (lon1 + 360 - lon0); lonL = lon0; lonR = lon1; }
  fy = clamp(fy, 0, 1);

  const v00 = gv(latT, lonL);
  const v10 = gv(latB, lonL);
  const v01 = gv(latT, lonR);
  const v11 = gv(latB, lonR);

  const lerpV = (a, b, t) => {
    if (a == null && b == null) return null;
    if (a == null) return b;
    if (b == null) return a;
    return a + (b - a) * t;
  };

  const top = lerpV(v00, v01, fy);
  const bot = lerpV(v10, v11, fy);
  if (top == null && bot == null) return null;
  return lerpV(top, bot, fx);
}

function getWeatherSummary() {
  if (!weatherOrbState.weatherGrid.size) return null;

  let tempTotal = 0;
  let windTotal = 0;
  let maxRain = 0;
  let count = 0;

  weatherOrbState.weatherGrid.forEach((point) => {
    if (typeof point.temperature === "number") tempTotal += point.temperature;
    if (typeof point.windSpeed === "number") windTotal += point.windSpeed;
    if (typeof point.precipitation === "number") maxRain = Math.max(maxRain, point.precipitation);
    count += 1;
  });

  if (!count) return null;
  return {
    averageTemp: tempTotal / count,
    averageWind: windTotal / count,
    maxRain,
  };
}

function drawWeatherLayers(ctx, rotY, rotX, radius, centerX, centerY, timeMs) {
  // Prefer precomputed raster overlays when available (much cheaper than sampling
  // and drawing thousands of points).
  if (rastersEnabled() && (_tempRasterData || _precipRasterData)) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    renderWeatherTempRaster(ctx, centerX, centerY, radius, rotY, rotX);
    ctx.globalCompositeOperation = "lighter";
    renderWeatherPrecipRaster(ctx, centerX, centerY, radius, rotY, rotX);
    ctx.restore();
    return;
  }

  // Temperature overlay (semi-transparent gradient, always visible)
  for (let lat = -76; lat <= 76; lat += 3) {
    for (let lon = -180; lon < 180; lon += 3) {
      const point = latLonProjection(lat, lon, rotY, rotX);
      if (point.z <= 0) continue;
      const value = sampleTemperature(lat, lon, timeMs);
      if (value === null) continue;
      const x = centerX + point.x * radius;
      const y = centerY - point.y * radius;
      const a = (TEMP_OVERLAY_ALPHA_BASE + value * TEMP_OVERLAY_ALPHA_RANGE) * LOFI_WEATHER_INTENSITY;
      ctx.fillStyle = rgba(getTemperatureColor(value), a);
      ctx.beginPath();
      ctx.arc(x, y, lerp(1.8, 4.6, point.z), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Precipitation overlay (radar-style, always visible)
  for (let lat = -76; lat <= 76; lat += 3) {
    for (let lon = -180; lon < 180; lon += 3) {
      const point = latLonProjection(lat, lon, rotY, rotX);
      if (point.z <= 0) continue;
      let value = sampleRainfall(lat, lon, timeMs);
      if (value === null || value < 0.10) continue;
      const x = centerX + point.x * radius;
      const y = centerY - point.y * radius;
      const size = lerp(2.2, 4.4, point.z);
      const radar = getRainRadarColor(value);
      if (!radar) continue;
      ctx.fillStyle = rgba(radar[0], radar[1]);
      ctx.beginPath();
      ctx.arc(x, y, size * 1.15, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Cloud cover overlay (subtle, always visible)
  for (let lat = -76; lat <= 76; lat += 3) {
    for (let lon = -180; lon < 180; lon += 3) {
      const point = latLonProjection(lat, lon, rotY, rotX);
      if (point.z <= 0) continue;
      const value = sampleClouds(lat, lon, timeMs);
      if (value === null || value < 0.26) continue;
      const x = centerX + point.x * radius;
      const y = centerY - point.y * radius;
      const s = lerp(2.6, 6.4, point.z);
      // Light mist instead of dark blotches.
      ctx.fillStyle = `rgba(240, 246, 255, ${(0.016 * value) * LOFI_WEATHER_INTENSITY})`;
      ctx.beginPath();
      ctx.arc(x, y, s, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawWorldGeometry(ctx, rotY, rotX, radius, centerX, centerY) {
  if (!weatherOrbState.features.length) return false;

  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  for (const polygon of weatherOrbState.features) {
    for (const [ringIndex, ring] of polygon.entries()) {
      let started = false;
      ctx.beginPath();
      for (const [lon, lat] of ring) {
        const point = latLonProjection(lat, lon, rotY, rotX);
        if (point.z <= 0) {
          started = false;
          continue;
        }
        const x = centerX + point.x * radius;
        const y = centerY - point.y * radius;
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
      if (started) {
        ctx.strokeStyle = ringIndex === 0
          ? "rgba(180, 200, 220, 0.30)"
          : "rgba(140, 170, 200, 0.12)";
        ctx.lineWidth = ringIndex === 0 ? 0.8 : 0.3;
        ctx.stroke();
      }
    }
  }

  return true;
}

let nightOffscreen = null;

function getNightOffscreen(w, h) {
  if (!nightOffscreen || nightOffscreen.width !== w || nightOffscreen.height !== h) {
    nightOffscreen = document.createElement('canvas');
    nightOffscreen.width = w;
    nightOffscreen.height = h;
  }
  return nightOffscreen;
}

let weatherOverlayOffscreen = null;
let weatherOverlayCache = {
  w: 0,
  h: 0,
  // Quantized rotation reduces rebuild churn while dragging.
  qRotY: null,
  qRotX: null,
  radius: 0,
  lastDrawMs: 0,
};

function getWeatherOverlayOffscreen(w, h) {
  if (!weatherOverlayOffscreen || weatherOverlayOffscreen.width !== w || weatherOverlayOffscreen.height !== h) {
    weatherOverlayOffscreen = document.createElement("canvas");
    weatherOverlayOffscreen.width = w;
    weatherOverlayOffscreen.height = h;
    weatherOverlayCache = { w, h, qRotY: null, qRotX: null, radius: 0, lastDrawMs: 0 };
  }
  return weatherOverlayOffscreen;
}

function quantizeRotation(rad) {
  return Math.round(rad / TEXTURE_ROT_STEP) * TEXTURE_ROT_STEP;
}

let globeRotY = 0;
let globeRotX = 0;
let globeZoom = 1;
let globeDrag = { active: false, startX: 0, startY: 0, startRotY: 0, startRotX: 0 };

function setupGlobeInteraction(canvas) {
  const onStart = (clientX, clientY) => {
    globeDrag.active = true;
    globeDrag.startX = clientX;
    globeDrag.startY = clientY;
    globeDrag.startRotY = globeRotY;
    globeDrag.startRotX = globeRotX;
  };
  const onMove = (clientX, clientY) => {
    if (!globeDrag.active) return;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    const dx = clientX - globeDrag.startX;
    const dy = clientY - globeDrag.startY;
    // Grab-and-drag feel: drag right -> texture moves right.
    globeRotY = globeDrag.startRotY + (dx / w) * Math.PI * 2;
    globeRotX = globeDrag.startRotX + (dy / h) * Math.PI * 2;
    globeRotX = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, globeRotX));
  };
  const onEnd = () => { globeDrag.active = false; };

  canvas.addEventListener("mousedown", (e) => onStart(e.clientX, e.clientY));
  window.addEventListener("mousemove", (e) => onMove(e.clientX, e.clientY));
  window.addEventListener("mouseup", onEnd);

  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    globeZoom *= Math.exp(-e.deltaY * 0.001);
    globeZoom = Math.max(0.3, Math.min(4, globeZoom));
  }, { passive: false });

  let pinchDist = 0;
  canvas.addEventListener("touchstart", (e) => {
    if (e.touches.length === 1) onStart(e.touches[0].clientX, e.touches[0].clientY);
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchDist = Math.sqrt(dx * dx + dy * dy);
    }
  }, { passive: true });
  canvas.addEventListener("touchmove", (e) => {
    if (e.touches.length === 1) onMove(e.touches[0].clientX, e.touches[0].clientY);
    if (e.touches.length === 2) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (pinchDist > 0) {
        globeZoom *= dist / pinchDist;
        globeZoom = Math.max(0.3, Math.min(4, globeZoom));
      }
      pinchDist = dist;
    }
  }, { passive: false });
  canvas.addEventListener("touchend", (e) => {
    if (e.touches.length < 2) pinchDist = 0;
    if (e.touches.length === 0) onEnd();
  }, { passive: true });
}

function drawWeatherOrbFrame(ctx, canvas, timeMs) {
  const width = canvas.width;
  const height = canvas.height;
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) * 0.34 * globeZoom;

  ctx.clearRect(0, 0, width, height);

  // Base fill behind the texture (keeps dark theme, but avoids crushing blacks)
  ctx.fillStyle = "#0b253c";
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.fill();

  // Quantize rotation for expensive texture projections.
  const rotY = quantizeRotation(globeRotY);
  const rotX = quantizeRotation(globeRotX);

  // Moon: approximate real position + phase based on current UTC time.
  // Draw outside the orb, so it reads like a nearby companion body.
  {
    const nowMs = Date.now();
    const d = (nowMs - J2000_MS) / 86400000;
    const moonEq = computeMoonGeocentricEq(d);

    // Sun vector from the cached celestial bodies (close enough for phase).
    const bodies = getCelestialBodies();
    const sunBody = bodies.find(b => b.sun);
    const sunEqVec = sunBody ? eqToUnitVec(sunBody.ra, sunBody.dec) : { x: 0, y: 0, z: 1 };
    const moonEqVec = eqToUnitVec(moonEq.ra, moonEq.dec);

    const dot = Math.max(-1, Math.min(1, sunEqVec.x * moonEqVec.x + sunEqVec.y * moonEqVec.y + sunEqVec.z * moonEqVec.z));
    const elong = Math.acos(dot); // 0=new, pi=full
    const illum = clamp01((1 - Math.cos(elong)) * 0.5);

    // Determine waxing/waning from the sign of the Moon's ecliptic longitude relative to the Sun.
    // Using equatorial RA as a proxy works well enough for a visual cue.
    const sunRa = sunBody ? sunBody.ra : 0;
    const dRa = ((moonEq.ra - sunRa + Math.PI * 3) % (2 * Math.PI)) - Math.PI;
    const waxing = dRa > 0;

    const moonView = rotateVecToView(moonEqVec, rotY, rotX);
    const sunView = rotateVecToView(sunEqVec, rotY, rotX);

    // Place the Moon on a ring around the Earth based on its sky direction.
    const moonDist = radius * 2.05;
    const mx = centerX + moonView.x * moonDist;
    const my = centerY - moonView.y * moonDist;

    // Visual-but-plausible size: keep the Moon clearly readable but not dominant.
    // (True scale would require placing it ~60 Earth radii away, off-screen.)
    const distNorm = clamp01((moonEq.distKm - 356000) / (406000 - 356000));
    const moonR = radius * lerp(0.032, 0.028, distNorm);

    const moonToCenter = Math.sqrt((mx - centerX) ** 2 + (my - centerY) ** 2);
    if (moonToCenter > radius * 1.15) {
      // Soft glow
      const gR = moonR * 2.6;
      const mg = ctx.createRadialGradient(mx, my, 0, mx, my, gR);
      mg.addColorStop(0, `rgba(255, 250, 240, ${0.14 + 0.10 * illum})`);
      mg.addColorStop(1, "rgba(255, 250, 240, 0)");
      ctx.fillStyle = mg;
      ctx.beginPath();
      ctx.arc(mx, my, gR, 0, Math.PI * 2);
      ctx.fill();

      // Body
      ctx.fillStyle = `rgba(232, 228, 218, ${0.78 + 0.12 * illum})`;
      ctx.beginPath();
      ctx.arc(mx, my, moonR, 0, Math.PI * 2);
      ctx.fill();

      // Phase shading: a simple two-circle mask oriented by the Sun direction on the sky.
      // This is not physically perfect, but tracks waxing/waning and terminator orientation.
      const sx = sunView.x - moonView.x;
      const sy = sunView.y - moonView.y;
      const sLen = Math.sqrt(sx * sx + sy * sy) || 1;
      const ux = sx / sLen;
      const uy = sy / sLen;

      // Offset amount maps illumination 0..1 into a disk intersection.
      const offset = (1 - 2 * illum) * moonR;
      const shadeX = mx - ux * offset;
      const shadeY = my + uy * offset;

      ctx.save();
      ctx.beginPath();
      ctx.arc(mx, my, moonR, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = "rgba(4, 10, 18, 0.92)";
      ctx.beginPath();
      // Flip the mask for waxing vs waning.
      const flip = waxing ? -1 : 1;
      ctx.arc(shadeX + ux * moonR * 0.12 * flip, shadeY - uy * moonR * 0.12 * flip, moonR * 0.98, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // A tiny specular hint on the sunward side.
      ctx.fillStyle = `rgba(255, 255, 255, ${0.10 * illum})`;
      ctx.beginPath();
      ctx.arc(mx + ux * moonR * 0.35, my - uy * moonR * 0.35, moonR * 0.22, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.save();
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.clip();

  renderEarthTexture(ctx, centerX, centerY, radius, rotY, rotX);

  // Ambient lift so the texture reads on darker monitors.
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  const lift = ctx.createRadialGradient(centerX, centerY, radius * 0.1, centerX, centerY, radius * 1.05);
  lift.addColorStop(0, "rgba(255, 255, 255, 0.11)");
  lift.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = lift;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.fill();

  // Slight blue lift to bring oceans/land out of the base fill.
  ctx.fillStyle = "rgba(110, 150, 210, 0.07)";
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  drawWorldGeometry(ctx, rotY, rotX, radius, centerX, centerY);

  // Expensive weather overlay: cache to an offscreen canvas and refresh at low FPS
  // or when rotation/zoom changes enough.
  const overlay = getWeatherOverlayOffscreen(canvas.width, canvas.height);
  const oqy = quantizeRotation(rotY);
  const oqx = quantizeRotation(rotX);
  const refreshEveryMs = 1000 / WEATHER_OVERLAY_FPS;
  const needsRebuild =
    weatherOverlayCache.qRotY !== oqy ||
    weatherOverlayCache.qRotX !== oqx ||
    Math.abs(weatherOverlayCache.radius - radius) > 0.5 ||
    timeMs - weatherOverlayCache.lastDrawMs > refreshEveryMs;

  if (needsRebuild) {
    const octx = overlay.getContext("2d");
    octx.clearRect(0, 0, overlay.width, overlay.height);
    octx.save();
    octx.beginPath();
    octx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    octx.clip();

    // Light gridlines (very subtle)
    octx.strokeStyle = "rgba(120, 160, 200, 0.045)";
    octx.lineWidth = 0.55;
    for (let lat = -60; lat <= 60; lat += 30) {
      octx.beginPath();
      let started = false;
      for (let lon = -180; lon <= 180; lon += 4) {
        const point = latLonProjection(lat, lon, oqy, oqx);
        if (point.z <= 0) { started = false; continue; }
        const x = centerX + point.x * radius;
        const y = centerY - point.y * radius;
        if (!started) { octx.moveTo(x, y); started = true; }
        else octx.lineTo(x, y);
      }
      octx.stroke();
    }

    drawWeatherLayers(octx, oqy, oqx, radius, centerX, centerY, timeMs);
    octx.restore();

    weatherOverlayCache.qRotY = oqy;
    weatherOverlayCache.qRotX = oqx;
    weatherOverlayCache.radius = radius;
    weatherOverlayCache.lastDrawMs = timeMs;
  }

  ctx.drawImage(overlay, 0, 0);
  drawWindParticles(ctx, rotY, rotX, radius, centerX, centerY, timeMs);

  // Sun-direction-based night shadow gradient
  const bodies = getCelestialBodies();
  const sunBody = bodies.find(b => b.sun);
  let sunSx = -0.3, sunSy = 0;
  if (sunBody) {
    const ra = sunBody.ra, dec = sunBody.dec;
    const cDec = Math.cos(dec);
    const swx = cDec * Math.sin(ra);
    const swy = Math.sin(dec);
    const swz = cDec * Math.cos(ra);
    const cX = Math.cos(rotX), sX = Math.sin(rotX);
    const rx_y = swy * cX + swz * sX;
    const rx_z = -swy * sX + swz * cX;
    const cY = Math.cos(rotY), sY = Math.sin(rotY);
    const rv_x = swx * cY - rx_z * sY;
    const rv_y = rx_y;
    const len = Math.sqrt(rv_x * rv_x + rv_y * rv_y);
    if (len > 0.001) { sunSx = rv_x / len; sunSy = rv_y / len; }
  }

  // Note: removed additional vignette + night-side shading to keep the globe
  // as a surface-only texture (avoids the "dark sphere inside" look).

  if (nightTexture.img) {
    const nc = getNightOffscreen(canvas.width, canvas.height);
    const nctx = nc.getContext("2d");
    nctx.clearRect(0, 0, nc.width, nc.height);

    nctx.save();
    nctx.beginPath();
    nctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    nctx.clip();
    renderNightTexture(nctx, centerX, centerY, radius, rotY, rotX);
    nctx.restore();

    const maskGrad = nctx.createLinearGradient(
      centerX - sunSx * radius, centerY - sunSy * radius,
      centerX + sunSx * radius, centerY + sunSy * radius
    );
    maskGrad.addColorStop(0, "rgba(255, 255, 255, 0.88)");
    maskGrad.addColorStop(0.4, "rgba(255, 255, 255, 0.65)");
    maskGrad.addColorStop(0.7, "rgba(255, 255, 255, 0.25)");
    maskGrad.addColorStop(1, "rgba(255, 255, 255, 0)");
    nctx.globalCompositeOperation = "destination-in";
    nctx.fillStyle = maskGrad;
    nctx.fillRect(0, 0, nc.width, nc.height);
    nctx.globalCompositeOperation = "source-over";

    ctx.globalCompositeOperation = "lighter";
    ctx.drawImage(nc, 0, 0);
    ctx.globalCompositeOperation = "source-over";
  } else {
    for (const [clat, clon, cpop] of CITIES) {
      const point = latLonProjection(clat, clon, rotY, rotX);
      if (point.z <= 0 || point.x >= 0) continue;
      const sx = centerX + point.x * radius;
      const sy = centerY - point.y * radius;
      const popFactor = Math.log2(cpop + 1) / 5.5;
      const glowR = lerp(2.5, 9, popFactor) * (0.65 + 0.35 * point.z);
      const coreR = lerp(0.4, 2.2, popFactor) * (0.65 + 0.35 * point.z);
      const twinkle = 0.8 + 0.2 * Math.sin(timeMs * 0.001 * (7 + cpop % 13) + clon);
      const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, glowR);
      glow.addColorStop(0, `rgba(255, 245, 210, ${(0.22 * LOFI_GLOW_INTENSITY) * twinkle})`);
      glow.addColorStop(0.4, `rgba(255, 220, 160, ${(0.08 * LOFI_GLOW_INTENSITY) * twinkle})`);
      glow.addColorStop(1, "rgba(255, 220, 160, 0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(sx, sy, glowR, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(255, 250, 235, ${(0.55 * LOFI_GLOW_INTENSITY) * twinkle})`;
      ctx.beginPath();
      ctx.arc(sx, sy, coreR, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  for (const sign of [1, -1]) {
    for (let lat = 62; lat <= 82; lat += 1.5) {
      for (let lon = -180; lon < 180; lon += 3) {
        const point = latLonProjection(lat * sign, lon, rotY, rotX);
        if (point.z <= 0 || point.x >= 0) continue;
        const sx = centerX + point.x * radius;
        const sy = centerY - point.y * radius;
        const nx = lon * 0.05 + timeMs * 0.00007;
        const ny = lat * 0.04 + timeMs * 0.00004;
        const c1 = smoothNoise(nx, ny);
        const c2 = smoothNoise(nx * 0.5 + 10, ny * 0.5 + 10);
        const curtain = c1 * 0.5 + c2 * 0.5;
        const intensity = curtain * 0.65 - 0.08;
        if (intensity <= 0) continue;
        const g = Math.round(50 + 200 * intensity);
        const r = Math.round(5 + 30 * intensity * smoothNoise(nx + 5, ny));
        const b = Math.round(20 + 60 * intensity * smoothNoise(ny + 5, nx));
        ctx.fillStyle = rgba([r, g, b], (0.12 * LOFI_GLOW_INTENSITY) * intensity);
        ctx.fillRect(sx - 1.5, sy - 1, 3, 2);
      }
    }
  }

  ctx.restore();

  // Toggle HUD with ?debug=1
  if (drawWeatherOrbFrame._debug == null) {
    try {
      drawWeatherOrbFrame._debug = new URLSearchParams(location.search).get("debug") === "1";
    } catch {
      drawWeatherOrbFrame._debug = false;
    }
  }
  if (drawWeatherOrbFrame._debug) drawDebugHud(ctx, canvas);
}

function renderStarfield(timeMs) {
  const canvas = document.getElementById("starfield-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const dpr = Math.min(window.devicePixelRatio || 1, STARFIELD_MAX_DPR);
  const w = Math.round(window.innerWidth);
  const h = Math.round(window.innerHeight);
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = w * dpr;
    canvas.height = h * dpr;
  }

  // Throttle starfield rendering; it's the most expensive full-screen layer.
  const minDt = 1000 / STARFIELD_FPS;
  if (renderStarfield._lastMs && timeMs - renderStarfield._lastMs < minDt) return;
  renderStarfield._lastMs = timeMs;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Milky Way glow at correct celestial position
  const bodies = getCelestialBodies();
  // Defensive: if anything corrupts the cached celestial array, don't crash rendering.
  const firstRa = Array.isArray(bodies) && bodies.length && bodies[0] && Number.isFinite(bodies[0].ra) ? bodies[0].ra : 0;
  const raOffset = firstRa - 1.5 * Math.PI;

  // Milky Way glow at correct celestial position
  const glowA = (0.004 + 0.003 * Math.sin(timeMs * 0.00004)) * LOFI_GLOW_INTENSITY;

  for (let ra = 0; ra < 2 * Math.PI; ra += 0.06) {
    const mwDec = Math.atan(-1.966 * Math.cos(ra - 3.366));
    // Keep the background sky fixed; only the globe should rotate.
    let nra = ((ra - raOffset) % (2 * Math.PI)) / (2 * Math.PI);
    if (nra < 0) nra += 1;
    const cx = nra * canvas.width;
    const cy = (0.5 - mwDec / Math.PI) * canvas.height;
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
    if (!s || !Number.isFinite(s.ra) || !Number.isFinite(s.dec)) continue;
    const speed = Number.isFinite(s.speed) ? s.speed : 0;
    const phase = Number.isFinite(s.phase) ? s.phase : 0;
    const baseAlpha = Number.isFinite(s.baseAlpha) ? s.baseAlpha : 0;
    const size = Number.isFinite(s.size) ? s.size : 0.8;
    const r = Number.isFinite(s.r) ? s.r : 255;
    const g = Number.isFinite(s.g) ? s.g : 255;
    const b = Number.isFinite(s.b) ? s.b : 255;
    const twinkle = 0.65 + 0.35 * Math.sin(timeMs * 0.001 * speed + phase);
    const alpha = baseAlpha * twinkle * 0.72;
    if (alpha < 0.01) continue;

    let nra = ((s.ra - raOffset) % (2 * Math.PI)) / (2 * Math.PI);
    if (nra < 0) nra += 1;
    const sx = nra * canvas.width;
    const sy = (0.5 - s.dec / Math.PI) * canvas.height;
    if (sx < -5 || sx > canvas.width + 5 || sy < -5 || sy > canvas.height + 5) continue;

    ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
    ctx.beginPath();
    ctx.arc(sx, sy, size * dpr, 0, 6.2832);
    ctx.fill();
  }

  // Sun and planets at actual celestial positions
  if (Array.isArray(bodies) && bodies.length) {
    for (const b of bodies) {
      if (!b || !Number.isFinite(b.ra) || !Number.isFinite(b.dec)) continue;
      let nra = ((b.ra - raOffset) % (2 * Math.PI)) / (2 * Math.PI);
      if (nra < 0) nra += 1;
      const bx = nra * canvas.width;
      const by = (0.5 - b.dec / Math.PI) * canvas.height;
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
        if (!b.c || !Array.isArray(b.c) || b.c.length < 3 || !Number.isFinite(b.s)) continue;
        const glow = ctx.createRadialGradient(bx, by, 0, bx, by, b.s * 3 * dpr);
        glow.addColorStop(0, `rgba(${b.c[0]},${b.c[1]},${b.c[2]},0.2)`);
        glow.addColorStop(1, `rgba(${b.c[0]},${b.c[1]},${b.c[2]},0)`);
        ctx.fillStyle = glow;
        ctx.fillRect(bx - b.s * 3 * dpr, by - b.s * 3 * dpr, b.s * 6 * dpr, b.s * 6 * dpr);

        ctx.fillStyle = `rgba(${b.c[0]},${b.c[1]},${b.c[2]},0.85)`;
        ctx.beginPath();
        ctx.arc(bx, by, b.s * dpr, 0, 6.2832);
        ctx.fill();
      }
    }
  }
}

// Static property used for render throttling.
renderStarfield._lastMs = 0;

function initializeWeatherOrb() {
  const { canvas } = getWeatherLayerNodes();
  if (!canvas) {
    reportFatal("Could not find #weather-orb-canvas");
    return;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    reportFatal("Could not get 2D context for #weather-orb-canvas");
    return;
  }

  // Render the orb at a capped DPR for performance.
  const resizeOrb = () => {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_CANVAS_DPR);
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
  };
  resizeOrb();
  window.addEventListener("resize", resizeOrb);

  loadEarthTexture();
  loadNightTexture();
  loadWeatherRasters();
  loadStarCatalog();
  loadWeatherGeometry();
  loadNoaaWeatherGrid().catch((err) => {
    console.warn("NOAA grid load failed", err);
    weatherOrbState.weatherGrid = new Map();
    weatherOrbState.weatherSource = "Weather grid unavailable";
  });

  setupGlobeInteraction(canvas);

  const render = (timestamp) => {
    try {
      renderStarfield(timestamp);
    } catch (err) {
      reportFatal(err);
    }
    try {
      drawWeatherOrbFrame(ctx, canvas, timestamp);
    } catch (err) {
      reportFatal(err);
    }
    window.requestAnimationFrame(render);
  };

  window.requestAnimationFrame(render);
}

function getCountryThumbnailDataURL(iso3, w, h) {
  const polygons = weatherOrbState.countryShapes?.get(iso3);
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

const NEWS_SEGMENT_COLORS = [
  "255 107 107", // red
  "254 202 87",  // amber
  "72 219 251",  // cyan
  "29 209 161",  // mint
  "84 160 255",  // blue
  "95 39 205",   // indigo
  "200 214 229", // silver
];

function setColorCodedSegments(target, text, className) {
  target.textContent = "";
  const parts = String(text || "").match(/\s+|[^\s]+/g) || [];
  let segIndex = 0;
  for (const part of parts) {
    if (!part) continue;
    if (/^\s+$/.test(part)) {
      target.appendChild(document.createTextNode(part));
      continue;
    }
    const span = document.createElement("span");
    span.className = className;
    span.style.setProperty("--seg-color", NEWS_SEGMENT_COLORS[segIndex % NEWS_SEGMENT_COLORS.length]);
    span.textContent = part;
    target.appendChild(span);
    segIndex += 1;
  }
}

function renderNewsItem(item) {
  const row = document.createElement("li");
  row.className = "news-row";

  const original = document.createElement("div");
  original.className = "news-original";

  const da = document.createElement("div");
  da.className = "news-da";

  const originalText = item.title || item.headline || item.text || "";
  const daText = item.da || toDaCore(originalText);

  // Color-code segments by position so each original segment maps visually to its transliteration.
  setColorCodedSegments(original, originalText, "syllable");
  setColorCodedSegments(da, daText, "translation");

  row.append(original, da);
  return row;
}

async function renderCountries(countries) {
  const root = document.querySelector("#country-list");
  root.innerHTML = "";
  const frag = document.createDocumentFragment();

  for (let index = 0; index < countries.length; index += 1) {
    const item = countries[index];
    const desc = item.description || "";
    const descClamped = desc.length > 280 ? desc.slice(0, 277) + "..." : desc;
    const thumbUrl = getCountryThumbnailDataURL(item.iso3, 52, 39);

    const article = document.createElement("article");
    article.className = "country-row";

    const rank = document.createElement("div");
    rank.className = "country-rank";
    rank.textContent = `#${index + 1}`;

    const thumbWrap = document.createElement("div");
    thumbWrap.className = "country-thumb-wrap";
    if (thumbUrl) {
      const img = document.createElement("img");
      img.className = "country-thumb";
      img.src = thumbUrl;
      img.width = 52;
      img.height = 39;
      img.alt = "";
      thumbWrap.appendChild(img);
    }

    const body = document.createElement("div");
    body.className = "country-copy";

    const name = document.createElement("p");
    name.className = "country-headline";
    name.textContent = item.name || "";

    const code = document.createElement("span");
    code.className = "country-code";
    code.textContent = item.iso3 || "";

    const header = document.createElement("div");
    header.className = "news-list-header";
    const h1 = document.createElement("span");
    h1.textContent = "Original";
    const h2 = document.createElement("span");
    h2.textContent = "ÐΛ Core + kit";
    header.append(h1, h2);

    const newsList = document.createElement("ul");
    newsList.className = "news-list";

    const headlineText = item.title || item.headline || item.text || "No headline.";
    const headlineDa = await toDaDisplay(headlineText, item.language || "");
    const row = renderNewsItem({ headline: headlineText, da: headlineDa });
    newsList.appendChild(row);

    body.append(name, code, header, newsList);

    if (descClamped) {
      const descDa = await toDaDisplay(descClamped, item.language || "");
      const drow = renderNewsItem({ text: descClamped, da: descDa });
      newsList.appendChild(drow);
    }

    const population = document.createElement("div");
    population.className = "country-population";
    population.appendChild(document.createTextNode(populationFormatter.format(item.population)));
    const year = document.createElement("span");
    year.textContent = item.year || "";
    population.appendChild(year);

    article.append(rank, thumbWrap, body, population);
    frag.appendChild(article);
  }

  root.appendChild(frag);
}

function renderLoading() {
  const root = document.querySelector("#country-list");
  root.innerHTML = "";
  const article = document.createElement("article");
  article.className = "country-row";
  const rank = document.createElement("div");
  rank.className = "country-rank";
  rank.textContent = "...";
  const thumbWrap = document.createElement("div");
  thumbWrap.className = "country-thumb-wrap";
  const body = document.createElement("div");
  const title = document.createElement("p");
  title.className = "country-headline";
  title.textContent = "Loading";
  body.appendChild(title);
  const pop = document.createElement("div");
  pop.className = "country-population";
  pop.textContent = "...";
  article.append(rank, thumbWrap, body, pop);
  root.appendChild(article);
}

function renderError() {
  const root = document.querySelector("#country-list");
  root.innerHTML = "";
  const article = document.createElement("article");
  article.className = "country-row";
  const rank = document.createElement("div");
  rank.className = "country-rank";
  rank.textContent = "!";
  const thumbWrap = document.createElement("div");
  thumbWrap.className = "country-thumb-wrap";
  const body = document.createElement("div");
  const title = document.createElement("p");
  title.className = "country-headline";
  title.textContent = "Could not load data.";
  body.appendChild(title);
  const pop = document.createElement("div");
  pop.className = "country-population";
  pop.textContent = "ERR";
  article.append(rank, thumbWrap, body, pop);
  root.appendChild(article);
}

async function loadCountries() {
  const response = await fetch(DATA_URL);
  const countries = await response.json();
  await renderCountries(countries);
}

initializeWeatherOrb();
renderLoading();
loadCountries().catch((err) => {
  console.error("Failed to load country data:", err);
  renderError();
});
