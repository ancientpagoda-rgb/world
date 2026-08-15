(() => {
  "use strict";

  const finalizedDaDisplay = toDaDisplay;

  // Fallback for scripts whose current transliterator still returns the DA
  // presentation layer internally. Users only see the IPA result.
  const DA_TO_IPA_FALLBACK = new Map([
    ["A", "a"], ["Λ", "ə"], ["ƛ", "ʌ"], ["À", "aːr"], ["Æ", "eər"],
    ["B", "b"], ["D", "d"], ["Ð", "ð"], ["E", "e"], ["Ξ", "iː"], ["C", "ɜːr"],
    ["F", "f"], ["G", "g"], ["H", "h"], ["I", "ɪ"], ["Φ", "aɪ"], ["Ȯ", "ɔɪ"],
    ["J", "dʒ"], ["Ҹ", "tʃ"], ["X", "ʃ"], ["Ʒ", "ʒ"], ["K", "k"], ["L", "l"],
    ["M", "m"], ["N", "n"], ["Ŋ", "ŋ"], ["O", "o"], ["Ω", "əʊ"], ["Ō", "ɔː"],
    ["P", "p"], ["R", "r"], ["S", "s"], ["T", "t"], ["U", "uː"], ["ʊ", "ʊ"],
    ["V", "v"], ["W", "w"], ["Ꝏ", "aʊ"], ["Y", "j"], ["Z", "z"], ["Þ", "θ"],
    ["ā", "aː"], ["ī", "iː"], ["ū", "uː"], ["ē", "eː"], ["ō", "oː"],
    ["ṝ", "ṛː"], ["ḹ", "ḷː"],
  ]);

  const COMMON_ENGLISH_IPA = new Map([
    ["the", "ðə"], ["a", "ə"], ["an", "æn"], ["and", "ænd"], ["of", "əv"], ["to", "tə"],
    ["for", "fɔːr"], ["from", "frʌm"], ["in", "ɪn"], ["on", "ɒn"], ["at", "æt"], ["by", "baɪ"],
    ["is", "ɪz"], ["are", "ɑːr"], ["was", "wɒz"], ["were", "wɜːr"], ["be", "biː"],
    ["this", "ðɪs"], ["that", "ðæt"], ["these", "ðiːz"], ["those", "ðəʊz"],
    ["they", "ðeɪ"], ["their", "ðeər"], ["there", "ðeər"], ["them", "ðɛm"], ["then", "ðɛn"],
    ["with", "wɪð"], ["as", "æz"], ["has", "hæz"], ["have", "hæv"], ["will", "wɪl"],
    ["would", "wʊd"], ["could", "kʊd"], ["should", "ʃʊd"], ["not", "nɒt"], ["new", "njuː"],
  ]);

  function daFallbackToIpa(input = "") {
    let output = "";
    for (const char of Array.from(String(input || ""))) {
      output += DA_TO_IPA_FALLBACK.get(char) ?? char;
    }
    return output;
  }

  function englishApproxIpa(input = "") {
    const parts = String(input || "").match(/\s+|[^\s]+/g) || [];
    return parts.map((part) => {
      if (/^\s+$/.test(part)) return part;
      const punctuationMatch = part.match(/^([^A-Za-z]*)(.*?)([^A-Za-z]*)$/);
      const prefix = punctuationMatch?.[1] || "";
      const core = punctuationMatch?.[2] || part;
      const suffix = punctuationMatch?.[3] || "";
      const lower = core.toLowerCase().replace(/[’']/g, "");
      if (!lower) return part;

      const common = COMMON_ENGLISH_IPA.get(lower);
      if (common) return `${prefix}${common}${suffix}`;

      let phonemes = normalizeEnglishForDa(core);

      // The base normalizer leaves several digraphs for the DA layer. Convert
      // them directly here instead of round-tripping through the custom alphabet.
      phonemes = phonemes
        .replace(/ture\b/g, "tʃər")
        .replace(/sh/g, "ʃ")
        .replace(/zh/g, "ʒ")
        .replace(/ch/g, "tʃ")
        .replace(/ng/g, "ŋ")
        .replace(/kh/g, "x")
        .replace(/ph/g, "f")
        .replace(/qu/g, "kw")
        .replace(/ck/g, "k")
        .replace(/c/g, "k")
        .replace(/th/g, "θ");

      // A few productive English spelling patterns that are otherwise ambiguous.
      phonemes = phonemes
        .replace(/ow(?=[nrl])/g, "aʊ")
        .replace(/ow\b/g, "əʊ")
        .replace(/igh/g, "aɪ")
        .replace(/air/g, "eər");

      // Convert unresolved English vowel letters to broad IPA values. Existing
      // diphthongs and long vowels from normalizeEnglishForDa remain intact.
      phonemes = phonemes
        .replace(/a/g, "æ")
        .replace(/e/g, "ɛ")
        .replace(/i/g, "ɪ")
        .replace(/o/g, "ɒ")
        .replace(/u/g, "ʌ")
        .replace(/y/g, "j");

      return `${prefix}${phonemes}${suffix}`;
    }).join("");
  }

  async function toIpaDisplay(input = "", language = "") {
    const text = String(input || "");
    if (!text) return "";
    const { body, suffix } = typeof splitSourceSuffix === "function"
      ? splitSourceSuffix(text)
      : { body: text, suffix: "" };
    const sourceText = body || text;
    const lang = String(language || "").toLowerCase().split(/[-_]/)[0];

    if (lang === "en" || isProbablyEnglishText(sourceText)) {
      return `${englishApproxIpa(sourceText)}${suffix}`.trim();
    }

    // The current multilingual transliterators produce a DA phonetic form.
    // Convert that form to broad IPA until each script gets a direct IPA engine.
    const da = await finalizedDaDisplay(sourceText, language);
    return `${daFallbackToIpa(da)}${suffix}`.trim();
  }

  window.toIpaDisplay = toIpaDisplay;

  const baseHydrateNewsItem = hydrateNewsItem;
  hydrateNewsItem = async function ipaHydrateNewsItem(row, originalText, language = "") {
    const phoneticsEl = row.querySelector(".news-da");
    const englishEl = row.querySelector(".news-en");
    if (!phoneticsEl || !englishEl) return baseHydrateNewsItem(row, originalText, language);

    const [ipaText, englishText] = await Promise.all([
      toIpaDisplay(originalText, language),
      toEnglishDisplay(originalText, language),
    ]);

    setColorCodedSegments(phoneticsEl, ipaText || originalText, "translation", "syllable");
    setColorCodedSegments(englishEl, englishText || originalText, "translation", "word");
    phoneticsEl.dataset.phoneticsMode = "ipa";
    phoneticsEl.setAttribute("aria-label", `IPA phonetics: ${ipaText || originalText}`);
    syncHeaders();
  };

  function syncHeaders() {
    for (const header of document.querySelectorAll(".news-list-header")) {
      const label = header.children?.[1];
      if (label) label.textContent = "IPA phonetics";
    }
  }

  const countryList = document.getElementById("country-list");
  if (countryList && typeof MutationObserver === "function") {
    new MutationObserver(syncHeaders).observe(countryList, { childList: true, subtree: true });
  }

  syncHeaders();
  setTimeout(() => {
    if (typeof applyCountryFilter === "function") {
      applyCountryFilter().catch((error) => console.warn("Initial IPA refresh failed:", error));
    }
  }, 0);

  window.__worldIpaDiagnostics = () => ({
    patched: true,
    hasIpaDisplay: typeof window.toIpaDisplay === "function",
    renderedMode: document.querySelector(".news-da")?.dataset.phoneticsMode || null,
    renderedSyllables: document.querySelectorAll(".news-da .syllable").length,
  });
})();