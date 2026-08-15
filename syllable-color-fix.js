(() => {
  "use strict";

  const PHONETIC_SYLLABLE_COLORS = [
    "255 107 107", // coral
    "254 202 87",  // amber
    "72 219 251",  // cyan
    "29 209 161",  // mint
    "84 160 255",  // blue
    "178 126 255", // violet
  ];

  // Includes the IPA vowel inventory used by the site, plus the older DA glyphs
  // so the runtime remains resilient while translations are hydrating.
  const PHONETIC_VOWELS = new Set([
    "a", "e", "i", "o", "u", "y", "æ", "ɑ", "ɐ", "ɒ", "ɔ", "ʌ", "ə", "ɚ", "ɜ", "ɝ", "ɞ",
    "ɛ", "ɘ", "ɤ", "ɨ", "ɪ", "ɯ", "ɵ", "œ", "ɶ", "ʉ", "ʊ", "ʏ", "ø", "ü",
    "ā", "ē", "ī", "ō", "ū", "à", "á", "â", "ä", "ã", "å", "è", "é", "ê", "ë",
    "ì", "í", "î", "ï", "ò", "ó", "ô", "ö", "õ", "ù", "ú", "û", "ý", "ÿ", "ṛ", "ḷ", "ḹ",
    "A", "Λ", "ƛ", "E", "Ξ", "I", "Φ", "Ȯ", "O", "Ω", "Ō", "U", "Ꝏ", "Æ", "C", "À",
  ]);

  const GRAPHEME_SEGMENTER = typeof Intl !== "undefined" && Intl.Segmenter
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : null;

  function graphemes(text = "") {
    const input = String(text || "");
    if (!input) return [];
    return GRAPHEME_SEGMENTER
      ? Array.from(GRAPHEME_SEGMENTER.segment(input), (part) => part.segment)
      : Array.from(input);
  }

  function isVowel(grapheme = "") {
    const base = String(grapheme || "").normalize("NFD").replace(/\p{M}+/gu, "").normalize("NFC");
    return PHONETIC_VOWELS.has(grapheme) || PHONETIC_VOWELS.has(base);
  }

  function isLetterLike(grapheme = "") {
    return /[\p{L}\p{N}]/u.test(String(grapheme || ""));
  }

  function splitPhoneticSyllables(word = "") {
    const input = String(word || "");
    const chars = graphemes(input);
    if (chars.length < 2) return [input];

    // Treat adjacent vowel symbols as one nucleus so IPA diphthongs such as
    // /aɪ/, /aʊ/, /ɔɪ/, /eɪ/, and /əʊ/ stay in a single colored syllable.
    const nuclei = [];
    let i = 0;
    while (i < chars.length) {
      if (!isVowel(chars[i])) {
        i += 1;
        continue;
      }
      const start = i;
      i += 1;
      while (i < chars.length && (isVowel(chars[i]) || chars[i] === "ː")) i += 1;
      nuclei.push({ start, end: i });
    }

    if (nuclei.length <= 1) return [input];

    const boundaries = [];
    for (let n = 0; n < nuclei.length - 1; n += 1) {
      const left = nuclei[n];
      const right = nuclei[n + 1];
      const between = chars.slice(left.end, right.start);
      const consonantIndexes = [];
      for (let j = 0; j < between.length; j += 1) {
        if (isLetterLike(between[j])) consonantIndexes.push(j);
      }

      let boundary = right.start;
      if (consonantIndexes.length) {
        // Attach the final consonant before the next nucleus to the next syllable.
        boundary = left.end + consonantIndexes[consonantIndexes.length - 1];
      }
      boundary = Math.max(left.end, Math.min(boundary, right.start));
      if (boundary > 0 && boundary < chars.length) boundaries.push(boundary);
    }

    if (!boundaries.length) return [input];
    const unique = [...new Set(boundaries)].sort((a, b) => a - b);
    const pieces = [];
    let start = 0;
    for (const end of unique) {
      if (end > start) pieces.push(chars.slice(start, end).join(""));
      start = end;
    }
    if (start < chars.length) pieces.push(chars.slice(start).join(""));
    const filtered = pieces.filter(Boolean);
    return filtered.length > 1 ? filtered : [input];
  }

  splitSyllableLikeWord = splitPhoneticSyllables;

  const baseSplitColorSegments = splitColorSegments;
  splitColorSegments = function patchedSplitColorSegments(text, mode = "word") {
    if (mode !== "syllable") return baseSplitColorSegments(text, mode);

    const input = String(text || "");
    if (!input) return [];
    const raw = input.match(/\s+|[\p{L}\p{N}\p{M}ʔʰʲ~ʼː]+|[^\s\p{L}\p{N}\p{M}ʔʰʲ~ʼː]+/gu) || [];
    const segments = [];
    for (const token of raw) {
      if (/^\s+$/.test(token)) {
        segments.push({ text: token, colorable: false });
        continue;
      }
      if (!/[\p{L}\p{N}]/u.test(token)) {
        segments.push({ text: token, colorable: false });
        continue;
      }
      for (const piece of splitPhoneticSyllables(token)) {
        segments.push({ text: piece, colorable: true });
      }
    }
    return segments;
  };

  const baseSetColorCodedSegments = setColorCodedSegments;
  setColorCodedSegments = function patchedSetColorCodedSegments(target, text, className, mode = "word") {
    if (mode !== "syllable") {
      return baseSetColorCodedSegments(target, text, className, mode);
    }

    target.textContent = "";
    const parts = splitColorSegments(text, "syllable");
    let syllableIndex = 0;
    for (const part of parts) {
      if (!part?.text) continue;
      if (!part.colorable) {
        target.appendChild(document.createTextNode(part.text));
        continue;
      }
      const span = document.createElement("span");
      span.className = `${className || "translation"} syllable`;
      span.dataset.syllableIndex = String(syllableIndex);
      span.style.setProperty("--seg-color", PHONETIC_SYLLABLE_COLORS[syllableIndex % PHONETIC_SYLLABLE_COLORS.length]);
      span.textContent = part.text;
      target.appendChild(span);
      syllableIndex += 1;
    }
  };

  function recolorRenderedPhonetics() {
    for (const element of document.querySelectorAll(".news-da")) {
      const text = element.textContent || "";
      if (text) setColorCodedSegments(element, text, "translation", "syllable");
    }
  }

  window.__worldSyllableDiagnostics = () => {
    const sample = "kəlɚ koʊdɪd sɪləbəl";
    const sampleParts = splitColorSegments(sample, "syllable").filter((part) => part.colorable).map((part) => part.text);
    return {
      patched: true,
      paletteSize: PHONETIC_SYLLABLE_COLORS.length,
      sample,
      sampleParts,
      renderedSyllables: document.querySelectorAll(".news-da .syllable").length,
    };
  };

  recolorRenderedPhonetics();
})();