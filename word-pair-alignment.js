(() => {
  "use strict";

  const WORD_TOKEN_RE = /[\p{L}\p{M}\p{N}]+(?:[’'-][\p{L}\p{M}\p{N}]+)*/gu;
  const counters = { rows: 0, words: 0, failures: 0 };

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
    // Golden-angle spacing gives every word its own visibly distinct hue while
    // preserving the exact same color for its Original ↔ IPA pair.
    const hue = 8 + Number(index || 0) * 137.508;
    const lightness = 0.64 + ((Number(index || 0) % 3) - 1) * 0.035;
    return hslToRgbTriplet(hue, 0.78, lightness);
  }

  function tokenizeSource(text = "") {
    const input = String(text || "");
    const parts = [];
    let cursor = 0;
    WORD_TOKEN_RE.lastIndex = 0;
    for (const match of input.matchAll(WORD_TOKEN_RE)) {
      const start = match.index ?? 0;
      if (start > cursor) parts.push({ text: input.slice(cursor, start), wordLike: false });
      parts.push({ text: match[0], wordLike: true });
      cursor = start + match[0].length;
    }
    if (cursor < input.length) parts.push({ text: input.slice(cursor), wordLike: false });
    return parts;
  }

  async function transcribeWord(word, language) {
    try {
      const ipa = await window.toIpaDisplay(String(word || ""), language);
      return String(ipa || word || "").trim() || String(word || "");
    } catch (error) {
      counters.failures += 1;
      console.warn("Word-pair IPA fallback:", error);
      return String(word || "");
    }
  }

  async function buildWordPairs(text, language = "") {
    const sourceParts = tokenizeSource(text);
    const wordParts = sourceParts.filter((part) => part.wordLike);
    const ipaWords = await Promise.all(wordParts.map((part) => transcribeWord(part.text, language)));
    let wordIndex = 0;
    return sourceParts.map((part) => {
      if (!part.wordLike) return { ...part };
      const index = wordIndex++;
      return {
        ...part,
        index,
        ipa: ipaWords[index] || part.text,
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

  async function alignHeadlineWordPairs(row, originalText, language = "") {
    const originalEl = row?.querySelector?.(".news-original");
    const ipaEl = row?.querySelector?.(".news-da");
    const englishEl = row?.querySelector?.(".news-en");
    if (!originalEl || !ipaEl || !englishEl) return false;

    const [parts, englishText] = await Promise.all([
      buildWordPairs(originalText, language),
      toEnglishDisplay(originalText, language),
    ]);
    const count = paintWordPairs(originalEl, ipaEl, parts);
    englishEl.textContent = englishText || originalText;
    ipaEl.dataset.phoneticsMode = "ipa";
    ipaEl.dataset.wordPairAligned = "true";
    originalEl.dataset.wordPairAligned = "true";
    ipaEl.setAttribute(
      "aria-label",
      `IPA phonetics: ${parts.map((part) => part.wordLike ? part.ipa : part.text).join("")}`,
    );
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
      originalWords: original.length,
      ipaWords: ipa.length,
      firstPairMatches: Boolean(
        firstOriginal && firstIpa
        && firstOriginal.dataset.wordIndex === firstIpa.dataset.wordIndex
        && firstOriginal.style.getPropertyValue("--seg-color") === firstIpa.style.getPropertyValue("--seg-color")
      ),
      coloredEnglishSpans: document.querySelectorAll(".news-en .translation, .news-en .word, .news-en .syllable").length,
    };
  };

  setTimeout(() => {
    if (typeof applyCountryFilter === "function") {
      applyCountryFilter().catch((error) => console.warn("Word-pair refresh failed:", error));
    }
  }, 0);
})();