(() => {
  "use strict";

  const WORD_TOKEN_RE = /[\p{L}\p{M}\p{N}]+(?:[’'-][\p{L}\p{M}\p{N}]+)*/gu;
  const STRICT_IPA_LEAK_RE = /[\p{Script=Han}\p{Script=Devanagari}\p{Script=Cyrillic}\p{Script=Greek}\p{Script=Arabic}\p{Script=Hangul}\p{Script=Hiragana}\p{Script=Katakana}]/u;
  const NON_LATIN_NATIVE_LANGS = new Set([
    "am", "ar", "be", "bg", "bn", "el", "fa", "gu", "he", "hi", "hy", "ja", "ka", "kk",
    "km", "ko", "ky", "lo", "mk", "mn", "my", "ne", "pa", "ps", "ru", "si", "sr", "ta", "tg",
    "th", "ti", "uk", "ur", "uz", "zh",
  ]);
  const TRANSLATION_TARGET_ALIASES = { zh: "zh-CN", srp: "sr" };
  const nativeHeadlineCache = new Map();
  const counters = { rows: 0, words: 0, failures: 0, nativeized: 0, nativeFailures: 0, strictIpaFallbacks: 0 };

  function primaryLanguage(language = "") {
    const raw = String(language || "").trim().toLowerCase().replace(/_/g, "-");
    return (raw === "srp" ? "sr" : raw.split("-")[0]) || "auto";
  }

  function hslToRgbTriplet(hue, saturation = 0.76, lightness = 0.66) {
    const h = ((Number(hue) % 360) + 360) % 360 / 60;
    const c = (1 - Math.abs(2 * lightness - 1)) * saturation;
    const x = c * (1 - Math.abs((h % 2) - 1));
    const m = lightness - c / 2;
    let r = 0, g = 0, b = 0;
    if (h < 1) [r, g] = [c, x];
    else if (h < 2) [r, g] = [x, c];
    else if (h < 3) [g, b] = [c, x];
    else if (h < 4) [g, b] = [x, c];
    else if (h < 5) [r, b] = [x, c];
    else [r, b] = [c, x];
    return `${Math.round((r + m) * 255)} ${Math.round((g + m) * 255)} ${Math.round((b + m) * 255)}`;
  }

  function wordColor(index) {
    const hue = 8 + Number(index || 0) * 137.508;
    const lightness = 0.64 + ((Number(index || 0) % 3) - 1) * 0.035;
    return hslToRgbTriplet(hue, 0.78, lightness);
  }

  function hasLatinIntrusion(text, language = "") {
    const lang = primaryLanguage(language);
    return NON_LATIN_NATIVE_LANGS.has(lang) && /\p{Script=Latin}{2,}/u.test(String(text || ""));
  }

  async function requestNativeTranslation(sourceText, language) {
    const target = TRANSLATION_TARGET_ALIASES[primaryLanguage(language)] || primaryLanguage(language);
    if (!target || target === "auto" || target === "en") return String(sourceText || "");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9000);
    try {
      const url = new URL("https://translate.googleapis.com/translate_a/single");
      url.searchParams.set("client", "gtx");
      url.searchParams.set("sl", "auto");
      url.searchParams.set("tl", target);
      url.searchParams.set("dt", "t");
      url.searchParams.set("q", String(sourceText || ""));
      const response = await fetch(url.toString(), { signal: controller.signal, cache: "no-store" });
      if (!response.ok) throw new Error(`native translation request failed: ${response.status}`);
      const data = await response.json();
      const translated = Array.isArray(data?.[0])
        ? data[0].map((part) => (Array.isArray(part) ? String(part[0] || "") : "")).join("").trim()
        : "";
      if (!translated) throw new Error("empty native translation response");
      return translated;
    } finally {
      clearTimeout(timer);
    }
  }

  async function nativeizeHeadlineText(text = "", language = "") {
    const input = String(text || "");
    if (!input || !hasLatinIntrusion(input, language)) return input;
    const key = `${primaryLanguage(language)}\u0000${input}`;
    if (nativeHeadlineCache.has(key)) return nativeHeadlineCache.get(key);
    try {
      const translated = await requestNativeTranslation(input, language);
      nativeHeadlineCache.set(key, translated);
      counters.nativeized += 1;
      return translated;
    } catch (error) {
      counters.nativeFailures += 1;
      console.warn("Native-language headline normalization unavailable:", error);
      return input;
    }
  }

  function tokenizeWithSegmenter(input, language) {
    if (typeof Intl?.Segmenter !== "function") return null;
    try {
      const lang = primaryLanguage(language);
      const locale = lang === "auto" ? undefined : lang;
      const segmenter = new Intl.Segmenter(locale, { granularity: "word" });
      return Array.from(segmenter.segment(input), (part) => ({ text: part.segment, wordLike: !!part.isWordLike }));
    } catch {
      return null;
    }
  }

  function tokenizeSource(text = "", language = "") {
    const input = String(text || "");
    const lang = primaryLanguage(language);
    if (["zh", "ja"].includes(lang) || /\p{Script=Han}/u.test(input)) {
      const segmented = tokenizeWithSegmenter(input, language);
      if (segmented) return segmented;
    }

    const parts = [];
    let cursor = 0;
    const tokenRe = /\p{Script=Han}|[\p{L}\p{M}\p{N}]+(?:[’'-][\p{L}\p{M}\p{N}]+)*/gu;
    tokenRe.lastIndex = 0;
    for (const match of input.matchAll(tokenRe)) {
      const start = match.index ?? 0;
      if (start > cursor) parts.push({ text: input.slice(cursor, start), wordLike: false });
      parts.push({ text: match[0], wordLike: true });
      cursor = start + match[0].length;
    }
    if (cursor < input.length) parts.push({ text: input.slice(cursor), wordLike: false });
    return parts;
  }

  function strictIpa(text) {
    const value = String(text || "").trim();
    return value && !STRICT_IPA_LEAK_RE.test(value) ? value : "";
  }

  async function transcribeWord(word, language) {
    try {
      const ipa = strictIpa(await window.toIpaDisplay(String(word || ""), language));
      if (ipa) return ipa;
      counters.strictIpaFallbacks += 1;
      return "?";
    } catch (error) {
      counters.failures += 1;
      console.warn("Word-pair IPA fallback:", error);
      return "?";
    }
  }

  async function buildWordPairs(text, language = "") {
    const sourceParts = tokenizeSource(text, language);
    const wordParts = sourceParts.filter((part) => part.wordLike);
    const ipaWords = await Promise.all(wordParts.map((part) => transcribeWord(part.text, language)));
    let wordIndex = 0;
    return sourceParts.map((part) => {
      if (!part.wordLike) return { ...part };
      const index = wordIndex++;
      return {
        ...part,
        index,
        ipa: ipaWords[index] || "?",
        color: wordColor(index),
      };
    });
  }

  function appendPlain(target, text) {
    if (text) target.appendChild(document.createTextNode(text));
  }

  function appendWord(target, text, index, color, side) {
    const span = document.createElement("span");
    span.className = `word coordinated-word paired-${side}`;
    span.dataset.wordIndex = String(index);
    span.dataset.pairSide = side;
    span.style.setProperty("--seg-color", color);
    span.textContent = text;
    target.appendChild(span);
  }

  function paintWordPairs(originalEl, ipaEl, parts) {
    originalEl.textContent = "";
    ipaEl.textContent = "";
    let count = 0;
    for (const part of parts) {
      if (!part.wordLike) {
        appendPlain(originalEl, part.text);
        appendPlain(ipaEl, part.text);
        continue;
      }
      appendWord(originalEl, part.text, part.index, part.color, "original");
      appendWord(ipaEl, part.ipa, part.index, part.color, "ipa");
      count += 1;
    }
    return count;
  }

  function syncHeaders() {
    for (const header of document.querySelectorAll(".news-list-header")) {
      if (header.children?.[0] && header.children[0].textContent !== "Native language") header.children[0].textContent = "Native language";
      if (header.children?.[1] && header.children[1].textContent !== "IPA phonetics") header.children[1].textContent = "IPA phonetics";
      if (header.children?.[2] && header.children[2].textContent !== "English translation") header.children[2].textContent = "English translation";
    }
  }

  async function alignHeadlineWordPairs(row, originalText, language = "") {
    const originalEl = row?.querySelector?.(".news-original");
    const ipaEl = row?.querySelector?.(".news-da");
    const englishEl = row?.querySelector?.(".news-en");
    if (!originalEl || !ipaEl || !englishEl) return false;

    const [nativeText, englishText] = await Promise.all([
      nativeizeHeadlineText(originalText, language),
      toEnglishDisplay(originalText, language),
    ]);
    const parts = await buildWordPairs(nativeText || originalText, language);
    const count = paintWordPairs(originalEl, ipaEl, parts);
    englishEl.textContent = englishText || originalText;
    ipaEl.dataset.phoneticsMode = "ipa";
    ipaEl.dataset.wordPairAligned = "true";
    originalEl.dataset.wordPairAligned = "true";
    originalEl.dataset.feedSource = String(originalText || "");
    originalEl.dataset.nativeNormalized = nativeText !== originalText ? "true" : "false";
    ipaEl.setAttribute(
      "aria-label",
      `IPA phonetics: ${parts.map((part) => part.wordLike ? part.ipa : part.text).join("")}`,
    );
    syncHeaders();
    counters.rows += 1;
    counters.words += count;
    return true;
  }

  const previousHydrateNewsItem = hydrateNewsItem;
  hydrateNewsItem = async function wordPairHydrate(row, originalText, language = "") {
    try {
      if (await alignHeadlineWordPairs(row, originalText, language)) return;
    } catch (error) {
      counters.failures += 1;
      console.warn("Word-pair alignment fallback:", error);
    }
    return previousHydrateNewsItem(row, originalText, language);
  };

  window.tokenizeHeadlineWords = tokenizeSource;
  window.nativeizeHeadlineText = nativeizeHeadlineText;
  window.alignHeadlineWordPairs = alignHeadlineWordPairs;
  window.__worldWordPairDiagnostics = () => {
    const original = Array.from(document.querySelectorAll(".news-original .paired-original"));
    const ipa = Array.from(document.querySelectorAll(".news-da .paired-ipa"));
    const firstOriginal = original[0];
    const firstIpa = ipa[0];
    return {
      patched: true,
      rows: counters.rows,
      words: counters.words,
      failures: counters.failures,
      nativeized: counters.nativeized,
      nativeFailures: counters.nativeFailures,
      strictIpaFallbacks: counters.strictIpaFallbacks,
      originalWords: original.length,
      ipaWords: ipa.length,
      firstPairMatches: Boolean(
        firstOriginal && firstIpa
        && firstOriginal.dataset.wordIndex === firstIpa.dataset.wordIndex
        && firstOriginal.style.getPropertyValue("--seg-color") === firstIpa.style.getPropertyValue("--seg-color")
      ),
      ipaScriptLeaks: ipa.filter((el) => STRICT_IPA_LEAK_RE.test(el.textContent || "")).length,
      coloredEnglishSpans: document.querySelectorAll(".news-en .translation, .news-en .word, .news-en .syllable").length,
    };
  };

  syncHeaders();
  setTimeout(() => {
    if (typeof applyCountryFilter === "function") {
      applyCountryFilter().catch((error) => console.warn("Word-pair refresh failed:", error));
    }
  }, 0);
})();