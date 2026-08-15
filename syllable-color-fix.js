(() => {
  "use strict";

  const DA_SYLLABLE_COLORS = [
    "255 107 107", // coral
    "254 202 87",  // amber
    "72 219 251",  // cyan
    "29 209 161",  // mint
    "84 160 255",  // blue
    "178 126 255", // violet
  ];

  // DA vowels and vowel-like nuclei after the phonetic finalizer runs.
  // Include the universal-kit fallbacks so partially transliterated languages
  // can still be syllabified instead of collapsing into one color per word.
  const DA_VOWEL_NUCLEI = new Set([
    "A", "Λ", "ƛ", "E", "Ξ", "I", "Φ", "Ȯ", "O", "Ω", "Ō", "U", "ʊ", "Ꝏ", "Æ", "C", "À",
    "a", "e", "i", "o", "u", "y", "ā", "ē", "ī", "ō", "ū", "æ", "œ", "ə", "ɨ", "ɪ", "ɔ", "ɒ",
    "à", "á", "â", "ä", "ã", "å", "è", "é", "ê", "ë", "ì", "í", "î", "ï", "ò", "ó", "ô", "ö", "õ", "ø",
    "ù", "ú", "û", "ü", "ý", "ÿ", "ṛ", "ḷ", "ḹ",
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

  function isVowelNucleus(grapheme = "") {
    const base = String(grapheme || "").normalize("NFD").replace(/\p{M}+/gu, "").normalize("NFC");
    return DA_VOWEL_NUCLEI.has(grapheme) || DA_VOWEL_NUCLEI.has(base);
  }

  function isLetterLike(grapheme = "") {
    return /[\p{L}\p{N}]/u.test(String(grapheme || ""));
  }

  function splitDaSyllables(word = "") {
    const input = String(word || "");
    const chars = graphemes(input);
    if (chars.length < 2) return [input];

    const nuclei = [];
    for (let i = 0; i < chars.length; i += 1) {
      if (isVowelNucleus(chars[i])) nuclei.push(i);
    }
    if (nuclei.length <= 1) return [input];

    const boundaries = [];
    for (let n = 0; n < nuclei.length - 1; n += 1) {
      const left = nuclei[n];
      const right = nuclei[n + 1];
      const between = chars.slice(left + 1, right);
      const consonants = between.filter(isLetterLike);

      // Maximize the next syllable's onset without swallowing the whole cluster.
      // V-V sequences split directly; one consonant goes with the next vowel;
      // larger clusters keep all but the last consonant with the prior syllable.
      let boundary;
      if (between.length === 0) {
        boundary = right;
      } else if (consonants.length <= 1) {
        boundary = Math.max(left + 1, right - 1);
      } else {
        boundary = Math.max(left + 1, right - 1);
      }
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
    return pieces.filter(Boolean).length > 1 ? pieces.filter(Boolean) : [input];
  }

  // Replace the base heuristic. It now understands the final DA glyph set.
  splitSyllableLikeWord = splitDaSyllables;

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
      for (const piece of splitDaSyllables(token)) {
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
      span.style.setProperty("--seg-color", DA_SYLLABLE_COLORS[syllableIndex % DA_SYLLABLE_COLORS.length]);
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
    const sample = "KOLOR KΩDID SILΛBΛL";
    const sampleParts = splitColorSegments(sample, "syllable").filter((part) => part.colorable).map((part) => part.text);
    return {
      patched: true,
      paletteSize: DA_SYLLABLE_COLORS.length,
      sample,
      sampleParts,
      renderedSyllables: document.querySelectorAll(".news-da .syllable").length,
    };
  };

  recolorRenderedPhonetics();
})();